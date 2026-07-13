import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { FluxoService } from '../fluxo/fluxo.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { FiscalCalendarService } from '../fiscal-calendar/fiscal-calendar.service';
import { SolicitacoesService } from '../solicitacoes/solicitacoes.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
import { SefazDistribuicaoService } from '../sefaz/sefaz-distribuicao.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Sincronização agendada do drive (opção 1 — varredura periódica).
 *
 * A cada ciclo (SYNC_INTERVAL_MIN, padrão 15 min):
 *   1. Captura XMLs de clientes nunca varridos (analisarLote)
 *   2. Re-varre a carteira em rotação pegando só XMLs novos (sincronizarCarteira)
 *   3. Verifica recibos de quem ainda não foi checado na competência
 *   4. Re-checa quem estava sem recibo (pode ter aparecido no drive)
 *   5. Marca obrigações vencidas (markOverdue)
 *
 * Tudo em lotes pequenos e sequenciais — sem IA paga, dedup nos serviços.
 * Desligável com SYNC_ENABLED=false. Sem dependências externas (setInterval).
 */
@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('SyncScheduler');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRun: any = null;
  private proximaEm: Date | null = null;
  private lastAuditYmd: string | null = null;
  private aceleradoAgora = false;

  constructor(
    private readonly fluxo: FluxoService,
    private readonly analise: AnaliseClienteService,
    private readonly fiscalCalendar: FiscalCalendarService,
    private readonly solicitacoes: SolicitacoesService,
    private readonly ncm: NcmInteligenteService,
    private readonly sefaz: SefazDistribuicaoService,
    private readonly prisma: PrismaService,
  ) {}

  /** Progresso PÚBLICO (só contadores, sem dados sensíveis) — para acompanhar a 1ª volta do Delta. */
  async progressoPublico() {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const [comPasta, comDelta, docs2026Rows, docsHoje, totalDocs] = await Promise.all([
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null } } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null }, sharepointDeltaLink: { not: null } } }),
      this.prisma.document.findMany({ where: { issueDate: { gte: new Date(2026, 0, 1) } }, select: { issueDate: true } }),
      this.prisma.document.count({ where: { createdAt: { gte: hoje0 } } }),
      this.prisma.document.count(),
    ]);
    const porMes2026: Record<string, number> = {};
    for (const d of docs2026Rows) { if (!d.issueDate) continue; const m = new Date(d.issueDate).toISOString().slice(0, 7); porMes2026[m] = (porMes2026[m] ?? 0) + 1; }
    const pct = comPasta ? Math.round((comDelta / comPasta) * 100) : 0;
    return {
      clientesComPasta: comPasta, clientesLidosPeloDelta: comDelta, pctPrimeiraVolta: pct,
      primeiraVoltaCompleta: comPasta > 0 && comDelta >= comPasta,
      docs2026: docs2026Rows.length, porMes2026, docsHoje, totalDocs,
      executandoAgora: this.running,
      ultimoCiclo: this.lastRun?.finishedAt ?? null,
    };
  }

  private get enabled(): boolean {
    return (process.env.SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';
  }
  private get intervalMs(): number {
    const min = Math.max(5, parseInt(process.env.SYNC_INTERVAL_MIN ?? '15', 10) || 15);
    return min * 60_000;
  }

  // durante o backfill inicial roda mais rápido; depois relaxa pro intervalo normal
  private readonly BACKFILL_DELAY_MS = 3 * 60_000;

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log('SYNC_ENABLED=false — sincronização agendada desligada');
      return;
    }
    // primeiro ciclo 90s após o boot (deixa o app estabilizar); o loop se reagenda sozinho
    this.agendarProximo(90_000);
    this.logger.log('Sincronização agendada ativa — cadência adaptativa (acelera no backfill)');
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Reagenda o próximo ciclo (setTimeout único; sem sobreposição — só arma após terminar). */
  private agendarProximo(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.proximaEm = new Date(Date.now() + delayMs);
    this.timer = setTimeout(() => this.runCycle('agendado').catch(() => undefined), delayMs);
    this.timer.unref?.();
  }

  /** Ainda há trabalho de 1ª volta? (UF faltando, cliente elegível nunca consultado, Delta incompleto) */
  private async pendenteBackfill(): Promise<boolean> {
    const [semUF, naoConsultados, comPasta, comDelta] = await Promise.all([
      this.prisma.company.count({ where: { active: true, uf: null } }),
      this.prisma.company.count({ where: { active: true, uf: { not: null }, sefazUltConsultaEm: null } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null } } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null }, sharepointDeltaLink: { not: null } } }),
    ]);
    return semUF > 0 || naoConsultados > 0 || comDelta < comPasta;
  }

  status() {
    return {
      enabled: this.enabled,
      intervaloMin: this.intervalMs / 60000,
      cadenciaAtualMin: (this.aceleradoAgora ? this.BACKFILL_DELAY_MS : this.intervalMs) / 60000,
      backfillAcelerado: this.aceleradoAgora,
      executandoAgora: this.running,
      ultimaExecucao: this.lastRun,
      proximaEm: this.running ? null : this.proximaEm,
    };
  }

  /** Um ciclo completo de sincronização. Guardado contra sobreposição. */
  async runCycle(origem: string) {
    if (this.running) return { skipped: true, motivo: 'ciclo anterior ainda em execução' };
    this.running = true;
    const startedAt = new Date();
    const competencia = startedAt.toISOString().slice(0, 7);
    const resultado: any = { origem, competencia, startedAt: startedAt.toISOString() };

    const passo = async (nome: string, fn: () => Promise<any>) => {
      try {
        resultado[nome] = await fn();
      } catch (e: any) {
        resultado[nome] = { erro: e?.message ?? 'erro' };
        this.logger.warn(`sync ${nome}: ${e?.message ?? e}`);
      }
    };

    try {
      // DUAS CADEIAS EM PARALELO — a do Drive (Graph) e a do SEFAZ (Receita) usam APIs
      // diferentes; em série a cadeia pesada do Drive esfomeava a do SEFAZ (UF nunca
      // era preenchida e a varredura nunca rodava durante o backfill).
      const cadeiaDrive = (async () => {
        // 1. clientes nunca varridos (primeira captura de XMLs + PDFs)
        await passo('capturaInicial', () => this.analise.analisarLote(8, 150));
        // 2. rotação da carteira via DELTA do Graph — pega tudo na 1ª vez e só o que muda
        //    depois. Delta incremental é barato, então cobrimos MUITOS clientes por ciclo.
        await passo('deltaIncremental', () => this.analise.sincronizarDeltaLote(30));
        // 3. recibos ainda não checados nesta competência
        await passo('recibosNovos', () => this.fluxo.verificarRecibosLote(competencia, 8));
        // 4. re-checa quem estava sem recibo há mais de 1h
        await passo('recibosRecheck', () => this.fluxo.reverificarRecibosPendentes(competencia, 6, 60));
        // 5. higiene do calendário fiscal
        await passo('obrigacoesVencidas', () => this.fiscalCalendar.markOverdue());
      })();
      const cadeiaSefaz = (async () => {
        // 5a-0. clientes com CNPJ provisório: infere o real a partir dos próprios XMLs
        //       (emitente/destinatário dominante). Sem isso, UF e SEFAZ ficam impossíveis.
        await passo('sefazInferirCnpj', () => this.sefaz.inferirCnpjsReais());
        // 5a. pré-requisito — preenche a UF que falta (cUFAutor exigido), via BrasilAPI.
        //     Budget alto p/ zerar a fila logo; quando não falta nada é no-op.
        await passo('sefazPreencherUF', () => this.sefaz.preencherUFsFaltantes({ timeBudgetMs: 8 * 60_000 }));
        // 5b. varredura — puxa NF-e da Receita p/ todos os elegíveis com o certificado do
        //     escritório, respeitando o limite de consumo (pula quem drenou há < 55min).
        await passo('sefazVarredura', () => this.sefaz.varrerTodos({ timeBudgetMs: 10 * 60_000 }));
      })();
      await Promise.all([cadeiaDrive, cadeiaSefaz]);
      // 6. início do mês (dia 01/02): solicitações de documentos + garante o calendário
      //    fiscal do ano (só p/ quem não tem — idempotente). Automatiza o "Configurar tudo".
      if (startedAt.getDate() <= 2) {
        await passo('solicitacoesMensais', () => this.solicitacoes.gerarSolicitacoesMensais());
        await passo('calendarioAno', () => this.fiscalCalendar.garantirAno(startedAt.getFullYear()));
      }
      // 7. análise + auditoria do acervo: aprende o Banco de NCM, revalida tudo contra a base
      //    legal e audita. Roda 1x/dia DEPOIS que o backfill assenta (ou toda segunda), pra os
      //    XMLs recém-puxados entrarem já analisados e auditados. (Cada doc já é validado no ingest.)
      const ymd = startedAt.toISOString().slice(0, 10);
      const backfillPend = await this.pendenteBackfill().catch(() => true);
      resultado.backfillPendente = backfillPend;
      if (startedAt.getDay() === 1 || (!backfillPend && this.lastAuditYmd !== ymd)) {
        await passo('aprenderNcm', () => this.ncm.aprenderDeDocumentos());
        await passo('revalidarAcervo', () => this.analise.revalidarDocumentos());
        await passo('auditoriaNcm', () => this.ncm.auditoria());
        this.lastAuditYmd = ymd;
      }
    } finally {
      resultado.finishedAt = new Date().toISOString();
      resultado.duracaoMs = Date.now() - startedAt.getTime();
      this.lastRun = resultado;
      this.running = false;
      this.logger.log(
        `sync ${origem} ok em ${Math.round(resultado.duracaoMs / 1000)}s — ` +
        `xmls novos: ${resultado.capturaIncremental?.novosDocs ?? 0} · ` +
        `recibos: +${(resultado.recibosNovos?.recibosEncontrados ?? 0) + (resultado.recibosRecheck?.recibosEncontrados ?? 0)} · ` +
        `vencidas: ${resultado.obrigacoesVencidas?.updated ?? 0} · ` +
        `sefaz: +${resultado.sefazVarredura?.novosTotal ?? 0} (${resultado.sefazVarredura?.processados ?? 0} clientes) · ` +
        `uf: +${resultado.sefazPreencherUF?.atualizados ?? 0}`,
      );
      // cadência adaptativa: acelera enquanto há 1ª volta pendente, depois relaxa
      let delay = this.intervalMs;
      try {
        this.aceleradoAgora = await this.pendenteBackfill();
        if (this.aceleradoAgora) delay = Math.min(this.intervalMs, this.BACKFILL_DELAY_MS);
      } catch { /* mantém intervalo normal */ }
      if (this.enabled) this.agendarProximo(delay);
    }
    return resultado;
  }
}
