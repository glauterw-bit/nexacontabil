import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { FluxoService } from '../fluxo/fluxo.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { FiscalCalendarService } from '../fiscal-calendar/fiscal-calendar.service';
import { SolicitacoesService } from '../solicitacoes/solicitacoes.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
import { SefazDistribuicaoService } from '../sefaz/sefaz-distribuicao.service';
import { VerificacaoFinalService } from '../verificacao-final/verificacao-final.service';
import { SeedDemoService } from '../torre-controle/seed-demo.service';
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
  private demoLimpo = false;
  private deltaResetFeito = false;
  private carteiraAlinhada = false;
  private reconGlobalFeita = false;
  private reconGlobalResultado: any = null;

  constructor(
    private readonly fluxo: FluxoService,
    private readonly analise: AnaliseClienteService,
    private readonly fiscalCalendar: FiscalCalendarService,
    private readonly solicitacoes: SolicitacoesService,
    private readonly ncm: NcmInteligenteService,
    private readonly sefaz: SefazDistribuicaoService,
    private readonly verificacao: VerificacaoFinalService,
    private readonly seedDemo: SeedDemoService,
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
    // COBERTURA DE CERTIFICADOS: quantas empresas (ativas) têm um .pfx/.p12 na pasta
    const certFiltro = { OR: [{ originalFilename: { endsWith: '.pfx' } }, { originalFilename: { endsWith: '.p12' } }] };
    const [certRows, senhaTxt, jaCadastrados] = await Promise.all([
      this.prisma.document.findMany({ where: certFiltro, select: { companyId: true } }),
      this.prisma.document.count({ where: { originalFilename: { contains: 'senha', mode: 'insensitive' }, fileUrl: { contains: '|' } } }),
      this.prisma.certificadoDigital.count({ where: { active: true, escritorio: false } }),
    ]);
    const empresasComCert = new Set(certRows.map((c) => c.companyId));
    const ativasIds = new Set((await this.prisma.company.findMany({ where: { active: true }, select: { id: true } })).map((c) => c.id));
    const ativasComCert = [...empresasComCert].filter((id) => ativasIds.has(id)).length;
    const certificados = {
      arquivosPfx: certRows.length,
      empresasComCertificado: empresasComCert.size,
      empresasAtivasComCertificado: ativasComCert,
      empresasAtivasSemCertificado: ativasIds.size - ativasComCert,
      arquivosSenhaTxt: senhaTxt,
      jaCadastradosNoSistema: jaCadastrados,
    };
    const porTipo = porTipoRows.map((r) => ({ tipo: r.type, n: r._count.id })).sort((a, b) => b.n - a.n);
    const naoXml = totalDocs - docsXml;
    return {
      totalDocs,
      xml: docsXml, naoXml, xmlSemValor,
      comEmitente, comValor, comData, comExtractedData: comExtract,
      pctXmlComValor: docsXml ? Math.round((comValor / docsXml) * 100) : 0,
      ultimoReprocessoNfse: this.lastRun?.reprocessarNfse ?? null,
      empresasComDocumentos: empresasComDoc.length, empresasAtivas,
      certificados,
      ultimoImportCert: this.lastRun?.importarCertificados ?? null,
      reconciliarGlobal: this.reconGlobalResultado ?? null,
      docsDoSefaz: docsSefaz,
      porTipo,
      amostraSemEmitente: amostraVazios.map((d) => ({ arquivo: (d.originalFilename ?? '').slice(-40), tipo: d.type })),
      leitura: docsXml && comValor / docsXml > 0.8
        ? 'XMLs estão sendo parseados com dados; documentos sem campos são PDFs/recibos (referência), não falha.'
        : 'Parte dos XMLs pode não estar sendo parseada — investigar formato (NFS-e municipal?).',
    };
  }

  /** Amostra pública da ESTRUTURA de XMLs sem valor (só nomes de tags) — diagnóstico. */
  async amostraXmlSemValor() {
    return this.analise.diagnosticarXmlSemValor(6);
  }

  /** Mapa das pastas do OneDrive (cacheado) — nomes de pasta agregados por cliente. */
  async mapearPastas() {
    return this.analise.mapearPastasOneDrive({ limitClientes: 120, timeBudgetMs: 4 * 60_000 });
  }

  /** Varredura PROFUNDA ao vivo de uma amostra — compara Drive real × capturado. */
  async escanearProfundo() {
    return this.analise.escanearProfundoAmostra(6);
  }

  /** Refresca os links de pasta (corrige itemId obsoleto → pasta certa). */
  async refrescarPastas() {
    return this.analise.refrescarPastas();
  }

  /** Realinha a carteira pelas pastas de "Empresas Ativas" (reativa clientes reais). */
  async realinharCarteira() {
    return this.analise.realinharCarteira();
  }

  /** Teste do scanner de produção (delta) numa amostra — acha 2026? */
  async escanearDelta() {
    return this.analise.escanearDeltaAmostra(6);
  }

  /** Busca global no Drive (Search API) por um termo — varre todas as pastas. */
  async buscarNoDrive(query: string) {
    return this.analise.buscarNoDrive(query || 'PGDASD');
  }

  /** Reconciliação RÁPIDA via Search (comprovantes do ano por cliente). */
  async reconciliarViaSearch(ano?: number) {
    return this.analise.reconciliarViaSearch({ ano, timeBudgetMs: 8 * 60_000 });
  }

  /** Reconciliação GLOBAL por tipo (acha entregas de qualquer ano) — gera calendários antes. */
  async reconciliarGlobal(anos = [2024, 2025, 2026]) {
    for (const a of anos) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
    return this.analise.reconciliarGlobalPorTipo({ anos });
  }

  /**
   * Amostra como os COMPROVANTES estão nomeados (valida a reconciliação): conta e mostra
   * exemplos de documentos cujo nome contém palavras de obrigação (DAS, DCTFWeb, FGTS...).
   */
  async amostraComprovantes() {
    const grupos: Record<string, string[]> = {
      DAS: ['das', 'pgdas', 'simei'], DCTFWeb: ['dctf'], FGTS: ['fgts'], ESOCIAL: ['esocial'],
      'EFD-REINF': ['reinf'], DARF: ['darf'], SPED: ['sped', 'efd'], ECD_ECF: ['ecd', 'ecf'], GUIA: ['guia', 'comprovante', 'recibo'],
    };
    const out: any = {};
    for (const [g, kws] of Object.entries(grupos)) {
      const where = { originalFilename: { endsWith: '.pdf' as const }, OR: kws.map((k) => ({ originalFilename: { contains: k, mode: 'insensitive' as const } })) };
      const total = await this.prisma.document.count({ where });
      const amostra = await this.prisma.document.findMany({ where, select: { originalFilename: true, folderPath: true }, take: 5, orderBy: { createdAt: 'desc' } });
      out[g] = { total, exemplos: amostra.map((d) => ({ nome: (d.originalFilename ?? '').slice(0, 40), pasta: (d.folderPath ?? '(sem pasta)').slice(-60) })) };
    }
    // quantos docs já têm folderPath preenchido (re-captura funcionando?)
    out._folderPath = {
      comPasta: await this.prisma.document.count({ where: { folderPath: { not: null } } }),
      total: await this.prisma.document.count(),
      // comprovantes DAS que referenciam 2026 na pasta (deveria haver muitos)
      dasCom2026: await this.prisma.document.count({ where: { originalFilename: { contains: 'pgdas', mode: 'insensitive' }, folderPath: { contains: '2026' } } }),
    };
    out._ultimaReconciliacao = this.lastRun?.reconciliarObrigacoes ?? '(ainda não rodou neste boot)';
    return out;
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
      // 0. LIMPEZA (1x): remove empresas DEMO (CNPJ 99999000*) e seus dados — pra os
      //    números refletirem só clientes reais.
      if (!this.demoLimpo) {
        await passo('limparDemo', () => this.seedDemo.limpar());
        this.demoLimpo = true;
      }
      // 0a. ALINHA A CARTEIRA (1x): desativa empresas fora da planilha oficial (pastas
      //     importadas como clientes, duplicatas) — resolve os "dados que não existem".
      if (!this.carteiraAlinhada) {
        await passo('alinharCarteira', () => this.verificacao.desativarForaDaPlanilha());
        this.carteiraAlinhada = true;
      }
      // 0c. RECONCILIAÇÃO GLOBAL (1x, EM BACKGROUND — não bloqueia o ciclo): busca cada
      //     tipo de comprovante no Drive inteiro e casa por tipo+competência (2024/25/26).
      //     É pesada (muitas buscas); roda destacada e grava o resultado quando termina.
      if (!this.reconGlobalFeita) {
        this.reconGlobalFeita = true;
        this.reconGlobalResultado = { status: 'rodando', em: startedAt.toISOString() };
        this.reconciliarGlobal([2024, 2025, 2026])
          .then((r) => { this.reconGlobalResultado = { status: 'concluido', ...r }; this.logger.log(`reconciliarGlobal: ${r?.marcadasEntregue} entregues, ${r?.clientesComEntrega} clientes`); })
          .catch((e) => { this.reconGlobalResultado = { status: 'erro', msg: e?.message }; });
      }
      // 0b. REFRESCA OS LINKS DE PASTA (1x): re-resolve a pasta atual de cada cliente
      //     (itemId obsoleto por pasta movida/recriada → apontava pra vazio, scanner lia
      //     lugar errado). Já zera o deltaLink dos religados p/ re-escanear a pasta certa.
      if (!this.deltaResetFeito) {
        await passo('refrescarPastas', () => this.analise.refrescarPastas());
        this.deltaResetFeito = true;
      }
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
        // 3. RECONCILIAÇÃO RÁPIDA VIA SEARCH — 1 busca no índice do Graph por cliente acha
        //    os comprovantes do ano (ex.: "05.2026 - Rec.pdf") sem re-capturar 137k arquivos.
        //    Marca entregue/vencida/pendente por competência. É a fonte de verdade das entregas.
        await passo('reconciliarViaSearch', () => this.analise.reconciliarViaSearch({ timeBudgetMs: 4 * 60_000 }));
        // 4. recibo genérico (fallback) p/ quem não casou por documento específico
        await passo('recibosNovos', () => this.fluxo.verificarRecibosLote(competencia, 6));
        // 5. marca vencidas o que sobrou pendente e já passou do prazo
        await passo('obrigacoesVencidas', () => this.fiscalCalendar.markOverdue());
      })();
      const cadeiaSefaz = (async () => {
        // 5a-00. CADASTRO OFICIAL (planilha 2026): CNPJ, regime e Ativa/Inativa — fonte
        //        da verdade; idempotente. Resolve a maioria antes de qualquer inferência.
        await passo('cadastroOficial', () => this.verificacao.aplicarCadastroOficial());
        // 5a-0. clientes com CNPJ provisório: infere o real a partir dos próprios XMLs
        //       (emitente/destinatário dominante). Sem isso, UF e SEFAZ ficam impossíveis.
        await passo('sefazInferirCnpj', () => this.sefaz.inferirCnpjsReais());
        // 5a-0b. importa em lote os certificados A1 das pastas dos clientes (senha via
        //        senha padrão do escritório [env] + CNPJ + arquivos senha.txt) → SEFAZ
        //        funciona SEM procuração p/ esses.
        await passo('importarCertificados', () => this.analise.importarCertificadosDrive({ senhaPadrao: process.env.CERT_SENHA_PADRAO || undefined, timeBudgetMs: 3 * 60_000 }));
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
