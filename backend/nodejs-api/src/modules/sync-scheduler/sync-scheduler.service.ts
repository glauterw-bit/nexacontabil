import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { FluxoService } from '../fluxo/fluxo.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { FiscalCalendarService } from '../fiscal-calendar/fiscal-calendar.service';
import { SolicitacoesService } from '../solicitacoes/solicitacoes.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
import { SefazDistribuicaoService } from '../sefaz/sefaz-distribuicao.service';
import { VerificacaoFinalService } from '../verificacao-final/verificacao-final.service';
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
    private readonly verificacao: VerificacaoFinalService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * DIAGNÓSTICO PÚBLICO da qualidade do acervo — responde "os documentos estão sendo
   * capturados COM dados?" sem expor nomes. Separa XML (parseado, tem valor/emitente) de
   * não-XML (PDF/recibo, só referência) e conta empresas com documentos.
   */
  async diagnosticoDocs() {
    const [
      totalDocs, docsXml, comEmitente, comValor, comData, comExtract,
      empresasComDoc, empresasAtivas, porTipoRows, docsSefaz,
      amostraVazios,
    ] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.document.count({ where: { originalFilename: { endsWith: '.xml' } } }),
      this.prisma.document.count({ where: { issuerName: { not: null } } }),
      this.prisma.document.count({ where: { totalValue: { not: null } } }),
      this.prisma.document.count({ where: { issueDate: { not: null } } }),
      this.prisma.document.count({ where: { extractedData: { not: null } } }),
      this.prisma.document.findMany({ distinct: ['companyId'], select: { companyId: true } }),
      this.prisma.company.count({ where: { active: true } }),
      this.prisma.document.groupBy({ by: ['type'], _count: { id: true } }),
      this.prisma.document.count({ where: { fileUrl: { startsWith: 'sefaz|' } } }),
      // amostra de arquivos SEM emitente (p/ ver se são PDFs/NFS-e municipais)
      this.prisma.document.findMany({ where: { issuerName: null }, select: { originalFilename: true, type: true }, take: 12, orderBy: { createdAt: 'desc' } }),
    ]);
    const xmlSemValor = await this.prisma.document.count({ where: { totalValue: null, originalFilename: { endsWith: '.xml' } } });
    const porTipo = porTipoRows.map((r) => ({ tipo: r.type, n: r._count.id })).sort((a, b) => b.n - a.n);
    const naoXml = totalDocs - docsXml;
    return {
      totalDocs,
      xml: docsXml, naoXml, xmlSemValor,
      comEmitente, comValor, comData, comExtractedData: comExtract,
      pctXmlComValor: docsXml ? Math.round((comValor / docsXml) * 100) : 0,
      ultimoReprocessoNfse: this.lastRun?.reprocessarNfse ?? null,
      empresasComDocumentos: empresasComDoc.length, empresasAtivas,
      docsDoSefaz: docsSefaz,
      porTipo,
      amostraSemEmitente: amostraVazios.map((d) => ({ arquivo: (d.originalFilename ?? '').slice(-40), tipo: d.type })),
      leitura: docsXml && comValor / docsXml > 0.8
        ? 'XMLs estão sendo parseados com dados; documentos sem campos são PDFs/recibos (referência), não falha.'
        : 'Parte dos XMLs pode não estar sendo parseada — investigar formato (NFS-e municipal?).',
    };
  }

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
    // diagnóstico do último delta SEM nomes de clientes (endpoint público)
    const det: any[] = this.lastRun?.deltaIncremental?.detalhes ?? [];
    const deltaErros = det.filter((d) => d.erro);
    return {
      clientesComPasta: comPasta, clientesLidosPeloDelta: comDelta, pctPrimeiraVolta: pct,
      primeiraVoltaCompleta: comPasta > 0 && comDelta >= comPasta,
      docs2026: docs2026Rows.length, porMes2026, docsHoje, totalDocs,
      executandoAgora: this.running,
      ultimoCiclo: this.lastRun?.finishedAt ?? null,
      ultimoDelta: this.lastRun?.deltaIncremental ? {
        processados: this.lastRun.deltaIncremental.processados,
        novos: this.lastRun.deltaIncremental.novos,
        erros: deltaErros.length,
        errosAmostra: deltaErros.slice(0, 5).map((d) => String(d.erro).slice(0, 140)),
      } : null,
      ultimoReparoPastas: this.lastRun?.pastasOrfas ?? null,
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

  /**
   * Ainda há trabalho de 1ª volta que o sistema CONSEGUE fazer sozinho?
   * Pendências que dependem de humano (CNPJ não inferível, certificado não reposto,
   * pasta inexistente) NÃO contam — senão o modo acelerado nunca desliga e a
   * auditoria diária nunca roda.
   */
  private async pendenteBackfill(): Promise<boolean> {
    const [semUFRows, naoConsultados, comPasta, comDelta] = await Promise.all([
      this.prisma.company.findMany({ where: { active: true, uf: null }, select: { cnpj: true } }),
      this.prisma.company.count({ where: { active: true, uf: { not: null }, sefazUltConsultaEm: null } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null } } }),
      this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null }, sharepointDeltaLink: { not: null } } }),
    ]);
    // UF só é acionável se o CNPJ for real (dá pra consultar a BrasilAPI)
    const semUFAcionavel = semUFRows.filter((c) => {
      const n = (c.cnpj ?? '').replace(/\D/g, '');
      return n.length === 14 && !n.startsWith('7');
    }).length;
    // SEFAZ só é acionável com certificado usável (existe e a senha abre)
    const certUsavel = naoConsultados > 0 ? await this.sefaz.certificadoEscritorioUsavel() : false;
    return semUFAcionavel > 0 || (naoConsultados > 0 && certUsavel) || comDelta < comPasta;
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
        // 2b. religa pastas órfãs (404 itemNotFound) — pasta movida/recriada no SharePoint
        await passo('pastasOrfas', () => this.analise.repararPastasOrfas());
        // 2c. reprocessa NFS-e/XMLs sem valor com o parser ABRASF (re-baixa e extrai)
        await passo('reprocessarNfse', () => this.analise.reprocessarSemValor({ timeBudgetMs: 3 * 60_000 }));
        // 3. recibos ainda não checados nesta competência
        await passo('recibosNovos', () => this.fluxo.verificarRecibosLote(competencia, 8));
        // 4. re-checa quem estava sem recibo há mais de 1h
        await passo('recibosRecheck', () => this.fluxo.reverificarRecibosPendentes(competencia, 6, 60));
        // 5. higiene do calendário fiscal
        await passo('obrigacoesVencidas', () => this.fiscalCalendar.markOverdue());
      })();
      const cadeiaSefaz = (async () => {
        // 5a-00. CADASTRO OFICIAL (planilha 2026): CNPJ, regime e Ativa/Inativa — fonte
        //        da verdade; idempotente. Resolve a maioria antes de qualquer inferência.
        await passo('cadastroOficial', () => this.verificacao.aplicarCadastroOficial());
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
