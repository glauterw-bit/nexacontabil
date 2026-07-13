import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { FluxoService } from '../fluxo/fluxo.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { FiscalCalendarService } from '../fiscal-calendar/fiscal-calendar.service';
import { SolicitacoesService } from '../solicitacoes/solicitacoes.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
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

  constructor(
    private readonly fluxo: FluxoService,
    private readonly analise: AnaliseClienteService,
    private readonly fiscalCalendar: FiscalCalendarService,
    private readonly solicitacoes: SolicitacoesService,
    private readonly ncm: NcmInteligenteService,
    private readonly prisma: PrismaService,
  ) {}

  /** Progresso PÚBLICO (só contadores, sem dados sensíveis) — para acompanhar a 1ª volta do Delta. */
  async progressoPublico() {
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const [comPasta, comDelta, docs2026, docsHoje, totalDocs] = await Promise.all([
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null } } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null }, sharepointDeltaLink: { not: null } } }),
      this.prisma.document.count({ where: { issueDate: { gte: new Date(2026, 0, 1) } } }),
      this.prisma.document.count({ where: { createdAt: { gte: hoje0 } } }),
      this.prisma.document.count(),
    ]);
    const pct = comPasta ? Math.round((comDelta / comPasta) * 100) : 0;
    return {
      clientesComPasta: comPasta, clientesLidosPeloDelta: comDelta, pctPrimeiraVolta: pct,
      primeiraVoltaCompleta: comPasta > 0 && comDelta >= comPasta,
      docs2026, docsHoje, totalDocs,
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

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log('SYNC_ENABLED=false — sincronização agendada desligada');
      return;
    }
    // primeiro ciclo 90s após o boot (deixa o app estabilizar), depois o intervalo
    const first = setTimeout(() => this.runCycle('boot').catch(() => undefined), 90_000);
    first.unref?.();
    this.timer = setInterval(() => this.runCycle('agendado').catch(() => undefined), this.intervalMs);
    this.timer.unref?.();
    this.proximaEm = new Date(Date.now() + 90_000);
    this.logger.log(`Sincronização agendada ativa — a cada ${this.intervalMs / 60000} min`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  status() {
    return {
      enabled: this.enabled,
      intervaloMin: this.intervalMs / 60000,
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
      // 1. clientes nunca varridos (primeira captura de XMLs + PDFs)
      await passo('capturaInicial', () => this.analise.analisarLote(8, 150));
      // 2. rotação da carteira via DELTA do Graph — pega tudo na 1ª vez e só o que muda
      //    depois. Delta incremental é barato, então cobrimos MUITOS clientes por ciclo
      //    (rotação completa em poucas passagens → documento novo aparece rápido).
      await passo('deltaIncremental', () => this.analise.sincronizarDeltaLote(30));
      // 3. recibos ainda não checados nesta competência
      await passo('recibosNovos', () => this.fluxo.verificarRecibosLote(competencia, 8));
      // 4. re-checa quem estava sem recibo há mais de 1h
      await passo('recibosRecheck', () => this.fluxo.reverificarRecibosPendentes(competencia, 6, 60));
      // 5. higiene do calendário fiscal
      await passo('obrigacoesVencidas', () => this.fiscalCalendar.markOverdue());
      // 6. início do mês (dia 01/02): solicitações de documentos + garante o calendário
      //    fiscal do ano (só p/ quem não tem — idempotente). Automatiza o "Configurar tudo".
      if (startedAt.getDate() <= 2) {
        await passo('solicitacoesMensais', () => this.solicitacoes.gerarSolicitacoesMensais());
        await passo('calendarioAno', () => this.fiscalCalendar.garantirAno(startedAt.getFullYear()));
      }
      // 7. semanal (segunda): aprende o Banco de NCM dos XMLs, revalida o acervo com a
      //    base legal e audita — mantém as inconsistências corretas sem clique manual.
      if (startedAt.getDay() === 1) {
        await passo('aprenderNcm', () => this.ncm.aprenderDeDocumentos());
        await passo('revalidarAcervo', () => this.analise.revalidarDocumentos());
        await passo('auditoriaNcm', () => this.ncm.auditoria());
      }
    } finally {
      resultado.finishedAt = new Date().toISOString();
      resultado.duracaoMs = Date.now() - startedAt.getTime();
      this.lastRun = resultado;
      this.proximaEm = new Date(Date.now() + this.intervalMs);
      this.running = false;
      this.logger.log(
        `sync ${origem} ok em ${Math.round(resultado.duracaoMs / 1000)}s — ` +
        `xmls novos: ${resultado.capturaIncremental?.novosDocs ?? 0} · ` +
        `recibos: +${(resultado.recibosNovos?.recibosEncontrados ?? 0) + (resultado.recibosRecheck?.recibosEncontrados ?? 0)} · ` +
        `vencidas: ${resultado.obrigacoesVencidas?.updated ?? 0}`,
      );
    }
    return resultado;
  }
}
