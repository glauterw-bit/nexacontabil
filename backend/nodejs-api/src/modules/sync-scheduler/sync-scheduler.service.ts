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
  private carteiraRealinhada = false;
  private appScanIndisponivel = false; // desliga o scan app-only no boot se faltar permissão Azure

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
  async buscarNoDrive(query: string, pasta?: string) {
    return this.analise.buscarNoDrive(query || 'PGDASD', pasta);
  }

  /** Reconciliação RÁPIDA via Search (comprovantes do ano por cliente). */
  async reconciliarViaSearch(ano?: number) {
    return this.analise.reconciliarViaSearch({ ano, timeBudgetMs: 8 * 60_000 });
  }

  private reconGlobalManual: any = null;

  /** Reconciliação GLOBAL por tipo — dispara em BACKGROUND (partição mensal é pesada, ~centenas
   *  de buscas). Consulte /reconciliar-global-status. Gera os calendários antes. */
  reconciliarGlobal(anos = [2024, 2025, 2026]) {
    if (this.reconGlobalManual?.status === 'rodando') return { status: 'rodando', desde: this.reconGlobalManual.em };
    this.reconGlobalManual = { status: 'rodando', em: new Date().toISOString(), anos };
    (async () => {
      for (const a of anos) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
      const r = await this.analise.reconciliarGlobalPorTipo({ anos });
      this.reconGlobalManual = { status: (r as any)?.erro ? 'erro' : 'concluido', em: new Date().toISOString(), ...r };
    })().catch((e) => { this.reconGlobalManual = { status: 'erro', msg: e?.message ?? String(e) }; });
    return { status: 'disparado', anos, dica: 'consulte /sync-drive/reconciliar-global-status' };
  }

  reconciliarGlobalStatus() {
    return this.reconGlobalManual ?? { status: 'nunca_rodou' };
  }

  private reconClienteManual: any = null;
  /** Reconciliação POR CLIENTE (código + classificação local) — background. */
  reconciliarPorCliente(anos = [new Date().getFullYear()]) {
    if (this.reconClienteManual?.status === 'rodando') return { status: 'rodando', desde: this.reconClienteManual.em };
    this.reconClienteManual = { status: 'rodando', em: new Date().toISOString(), anos };
    (async () => {
      for (const a of anos) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
      const r = await this.analise.reconciliarPorClienteScoped({ anos, timeBudgetMs: 12 * 60_000 });
      this.reconClienteManual = { status: (r as any)?.erro ? 'erro' : 'concluido', em: new Date().toISOString(), ...r };
    })().catch((e) => { this.reconClienteManual = { status: 'erro', msg: e?.message ?? String(e) }; });
    return { status: 'disparado', anos, dica: 'consulte /sync-drive/reconciliar-cliente-status' };
  }
  reconciliarPorClienteStatus() { return this.reconClienteManual ?? { status: 'nunca_rodou' }; }

  private reconPastasManual: any = null;
  /** Listador de pastas 2026 (descobre pasta + lista tudo + zip) — background. */
  reconciliarListandoPastas(anos = [new Date().getFullYear()]) {
    if (this.reconPastasManual?.status === 'rodando') return { status: 'rodando', desde: this.reconPastasManual.em };
    this.reconPastasManual = { status: 'rodando', em: new Date().toISOString(), anos };
    (async () => {
      for (const a of anos) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
      const r = await this.analise.reconciliarListandoPastas({ anos, timeBudgetMs: 13 * 60_000 });
      this.reconPastasManual = { status: (r as any)?.erro ? 'erro' : 'concluido', em: new Date().toISOString(), ...r };
    })().catch((e) => { this.reconPastasManual = { status: 'erro', msg: e?.message ?? String(e) }; });
    return { status: 'disparado', anos, dica: 'consulte /sync-drive/reconciliar-pastas2026-status' };
  }
  reconciliarListandoPastasStatus() { return this.reconPastasManual ?? { status: 'nunca_rodou' }; }

  private reconArvoreManual: any = null;
  /** Verificacao "tudo foi lido" via arvore completa (paginacao corrigida) — background. */
  reconciliarViaArvore(anos = [new Date().getFullYear()], limite?: number) {
    if (this.reconArvoreManual?.status === 'rodando') return { status: 'rodando', desde: this.reconArvoreManual.em };
    this.reconArvoreManual = { status: 'rodando', em: new Date().toISOString(), anos };
    (async () => {
      for (const a of anos) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
      const r = await this.analise.reconciliarViaArvore({ anos, limite, timeBudgetMs: 13 * 60_000 });
      this.reconArvoreManual = { status: (r as any)?.erro ? 'erro' : 'concluido', em: new Date().toISOString(), ...r };
    })().catch((e) => { this.reconArvoreManual = { status: 'erro', msg: e?.message ?? String(e) }; });
    return { status: 'disparado', anos, dica: 'consulte /sync-drive/reconciliar-arvore-status' };
  }
  reconciliarViaArvoreStatus() { return this.reconArvoreManual ?? { status: 'nunca_rodou' }; }

  /**
   * Reconciliação por DOCUMENTOS do banco (companyId 100% atribuído pelo delta) — para cada
   * ano, varre TODAS as empresas ativas em lotes até esgotar. É a fonte mais confiável:
   * não perde cliente (usa companyId), casa por nome+pasta do comprovante já capturado.
   */
  /** Busca TENANT-WIDE (Microsoft Search API) — o fluxo mais rápido/completo p/ ler todo o OneDrive. */
  async buscaTenant(query: string) {
    return this.analise.buscaTenant(query || 'PGDASD');
  }

  /** Enumera sites+drives via permissão de APLICAÇÃO (diagnóstico de cobertura 100%). */
  async enumerarSitesEDrives() {
    return this.analise.enumerarSitesEDrives();
  }

  /** Diagnostico Camada 3: baixa PDFs 2026 de um cliente e ve se sao nativos ou escaneados. */
  async diagnosticarPdfCliente(codigo: string) {
    return this.analise.diagnosticarPdfCliente(codigo);
  }

  /** Teste do explorador (arvore real) por codigo. */
  async explorar(codigo: string) {
    return this.analise.explorarCliente(codigo);
  }

  /** REMOVE de vez as empresas demo/ficticias (e seus registros dependentes). */
  async removerDemo() {
    const demos = await this.prisma.company.findMany({
      where: { OR: [
        { name: { contains: 'DEMO', mode: 'insensitive' } },
        { name: { contains: 'TESTE', mode: 'insensitive' } },
        { name: { contains: 'EXEMPLO', mode: 'insensitive' } },
        { name: { contains: 'FICTIC', mode: 'insensitive' } },
        { name: { contains: 'MODELO', mode: 'insensitive' } },
        { name: { contains: 'SAMPLE', mode: 'insensitive' } },
        { name: { contains: 'MOCK', mode: 'insensitive' } },
      ] },
      select: { id: true, name: true },
    });
    let removidas = 0;
    for (const c of demos) {
      await this.prisma.fiscalCalendarItem.deleteMany({ where: { companyId: c.id } }).catch(() => undefined);
      await this.prisma.document.deleteMany({ where: { companyId: c.id } }).catch(() => undefined);
      await this.prisma.fluxoEstado.deleteMany({ where: { companyId: c.id } }).catch(() => undefined);
      const ok = await this.prisma.company.delete({ where: { id: c.id } }).then(() => true).catch(() => false);
      if (ok) removidas++;
    }
    return { encontradas: demos.map((c) => c.name), removidas };
  }

  /** Detecta empresas DEMO/ficticias (nome ou CNPJ suspeito). Reporta; nao remove. */
  async checarDemo() {
    const susp = await this.prisma.company.findMany({
      where: { OR: [
        { name: { contains: 'DEMO', mode: 'insensitive' } },
        { name: { contains: 'TESTE', mode: 'insensitive' } },
        { name: { contains: 'EXEMPLO', mode: 'insensitive' } },
        { name: { contains: 'FICTIC', mode: 'insensitive' } },
        { name: { contains: 'MODELO', mode: 'insensitive' } },
        { name: { contains: 'SAMPLE', mode: 'insensitive' } },
        { name: { contains: 'MOCK', mode: 'insensitive' } },
      ] },
      select: { id: true, name: true, cnpj: true, active: true, clienteCodigo: true },
    });
    // CNPJs claramente falsos (todos iguais, sequenciais, ou 000...)
    const todos = await this.prisma.company.findMany({ select: { id: true, name: true, cnpj: true, active: true } });
    const cnpjFalso = todos.filter((c) => { const n = (c.cnpj || '').replace(/\D/g, ''); return n && (/^(\d)\1+$/.test(n) || n === '00000000000000' || n.startsWith('11111111') || n.length !== 14); });
    return {
      totalEmpresas: todos.length,
      ativas: todos.filter((c) => c.active).length,
      suspeitasPorNome: susp.map((c) => ({ nome: c.name, cnpj: c.cnpj, ativa: c.active, codigo: c.clienteCodigo })),
      suspeitasPorCnpj: cnpjFalso.slice(0, 40).map((c) => ({ nome: c.name, cnpj: c.cnpj, ativa: c.active })),
      resumo: susp.length === 0 && cnpjFalso.length === 0 ? 'Nenhuma empresa demo/ficticia encontrada.' : `${susp.length} suspeita(s) por nome, ${cnpjFalso.length} por CNPJ.`,
    };
  }

  /** Diagnóstico do gap de DAS — lista a pasta real de clientes com DAS vencido. */
  async diagnosticarDasFaltante(ano?: number) {
    return this.analise.diagnosticarDasFaltante(ano);
  }

  async auditarDasClientes(ano?: number, limit?: number) {
    return this.analise.auditarDasClientes(ano, limit);
  }

  async sondarClientePastas(codigo: string) {
    return this.analise.sondarClientePastas(codigo);
  }

  async previewPlanilha(nome?: string, maxRows?: number, aba?: string) {
    return this.analise.previewPlanilha(nome, maxRows, aba);
  }

  /** Link de consentimento de admin (Azure) — 1 clique libera as permissões de aplicação. */
  adminConsentUrl() {
    return this.analise.adminConsentUrl();
  }

  /** Reaplica vencidas (marca reais + reverte FGTS/eSocial p/ portal) — correção imediata. */
  async marcarVencidas() {
    return this.fiscalCalendar.markOverdue();
  }

  private appReconResultado: any = null;

  /** Dispara a reconciliação por SCAN COMPLETO (sites→drives→delta) em BACKGROUND (não bloqueia
   *  o HTTP — o scan é pesado). Guarda o resultado p/ consulta em /reconciliar-app-status. */
  reconciliarAppOnly(anos?: number[]) {
    const yy = anos ?? [new Date().getFullYear(), new Date().getFullYear() - 1];
    if (this.appReconResultado?.status === 'rodando') return { status: 'rodando', desde: this.appReconResultado.em };
    this.appReconResultado = { status: 'rodando', em: new Date().toISOString(), anos: yy };
    (async () => {
      for (const a of yy) await this.fiscalCalendar.garantirAno(a).catch(() => undefined);
      const r = await this.analise.reconciliarAppOnly({ anos: yy, timeBudgetMs: 12 * 60_000 });
      this.appReconResultado = { status: (r as any)?.erro ? 'erro' : 'concluido', em: new Date().toISOString(), ...r };
    })().catch((e) => { this.appReconResultado = { status: 'erro', msg: e?.message ?? String(e) }; });
    return { status: 'disparado', anos: yy, dica: 'consulte /sync-drive/reconciliar-app-status' };
  }

  /** Resultado da última reconciliação por scan completo (background). */
  reconciliarAppStatus() {
    return this.appReconResultado ?? { status: 'nunca_rodou' };
  }

  /** Resumo REAL das obrigações por tipo e status (entregue/vencida/pendente) num ano. */
  async resumoObrigacoes(ano = new Date().getFullYear(), incluirInativos = false) {
    // SÓ conta obrigações de clientes ATIVOS (inativo não pesa na taxa) — salvo incluirInativos.
    const ativos = incluirInativos ? null : (await this.prisma.company.findMany({ where: { active: true }, select: { id: true } })).map((c) => c.id);
    const whereAtivo = ativos ? { companyId: { in: ativos } } : {};
    const rows = await this.prisma.fiscalCalendarItem.groupBy({
      by: ['tipo', 'status'],
      where: { competencia: { startsWith: String(ano) }, ...whereAtivo },
      _count: { id: true },
    });
    const porTipo: Record<string, Record<string, number>> = {};
    const totalStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      (porTipo[r.tipo] ??= {})[r.status] = r._count.id;
      totalStatus[r.status] = (totalStatus[r.status] ?? 0) + r._count.id;
      total += r._count.id;
    }
    // por competência (mês) — quantas entregues vs total, p/ ver evolução do ano
    const porComp = await this.prisma.fiscalCalendarItem.groupBy({
      by: ['competencia', 'status'],
      where: { competencia: { startsWith: `${ano}-` }, ...whereAtivo },
      _count: { id: true },
    });
    const meses: Record<string, { entregue: number; total: number }> = {};
    for (const r of porComp) { const m = (meses[r.competencia] ??= { entregue: 0, total: 0 }); m.total += r._count.id; if (r.status === 'entregue' || r.status === 'paga') m.entregue += r._count.id; }
    return { ano, apenasAtivos: !incluirInativos, total, totalStatus, porTipo, meses };
  }

  /** IDENTIFICA os clientes INATIVOS que ainda têm obrigações pendentes/vencidas (fora da taxa). */
  async clientesInativosComObrigacao(ano?: number) {
    const inativas = await this.prisma.company.findMany({ where: { active: false }, select: { id: true, name: true, clienteCodigo: true, taxRegime: true, clienteDesde: true } });
    if (!inativas.length) return { total: 0, clientes: [] };
    const ids = inativas.map((c) => c.id);
    const where: any = { companyId: { in: ids }, status: { in: ['pendente', 'vencida'] } };
    if (ano) where.competencia = { startsWith: `${ano}-` };
    const grp = await this.prisma.fiscalCalendarItem.groupBy({ by: ['companyId'], where, _count: { id: true } });
    const cnt = new Map(grp.map((g) => [g.companyId, g._count.id]));
    const clientes = inativas
      .map((c) => ({ codigo: c.clienteCodigo, nome: c.name, regime: c.taxRegime, clienteDesde: c.clienteDesde ? c.clienteDesde.toISOString().slice(0, 10) : null, obrigacoesEmAberto: cnt.get(c.id) || 0 }))
      .filter((c) => c.obrigacoesEmAberto > 0)
      .sort((a, b) => b.obrigacoesEmAberto - a.obrigacoesEmAberto);
    return { total: clientes.length, totalObrigacoesForaDaTaxa: clientes.reduce((s, c) => s + c.obrigacoesEmAberto, 0), clientes };
  }

  /**
   * LIMPA registros que NÃO são empresas reais (pastas de controle importadas como "empresa":
   * GERÊNCIA, AGÊNCIAS, Anexos, DIVERSOS, DOCS...). CRITÉRIO CONSERVADOR: sem clienteCodigo E
   * nome de pasta-controle E sem sufixo societário (ltda/eireli/me/epp/mei/sa) e sem CNPJ válido.
   * dryRun só lista. Ao aplicar: apaga as obrigações e tenta deletar a empresa (se FK travar,
   * deixa inativa e sem obrigações — some da taxa e do painel).
   */
  async limparNaoClientes(opts?: { dryRun?: boolean }) {
    const dry = opts?.dryRun !== false; // default: só lista (seguro)
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const JUNK = /^(gerencia|agencia|agencias|anexo|anexos|controle|diversos|documentos|docs|modelo|modelos|arquivo|arquivos|backup|lixeira|teste|temp|pasta|fechamento|planilha|obrigacoes|encargos|folha|dp|departamento)\b/;
    const SUFIXO = /\b(ltda|eireli|epp|mei|sa|s\/a|me|ss|associacao|igreja|congregacao|condominio|instituto|fundacao|sociedade|servicos|comercio|distribuidora|industria|transportes|construcoes|consultoria)\b/;
    const cnpjValido = (raw?: string): boolean => {
      const s = (raw || '').replace(/\D/g, '');
      if (s.length !== 14 || /^(\d)\1{13}$/.test(s)) return false;
      const calc = (base: string, pesos: number[]) => { let sum = 0; for (let i = 0; i < pesos.length; i++) sum += parseInt(base[i], 10) * pesos[i]; const r = sum % 11; return r < 2 ? 0 : 11 - r; };
      const d1 = calc(s, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const d2 = calc(s, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return d1 === parseInt(s[12], 10) && d2 === parseInt(s[13], 10);
    };
    const empresas = await this.prisma.company.findMany({ select: { id: true, name: true, clienteCodigo: true, cnpj: true, active: true } });
    const comNomeJunk = empresas.filter((c) => JUNK.test(norm(c.name)) && !SUFIXO.test(norm(c.name)));
    const alvos = comNomeJunk.filter((c) => {
      const semCod = !c.clienteCodigo || !String(c.clienteCodigo).trim();
      return semCod && !cnpjValido(c.cnpj); // nome de pasta + sem código + CNPJ inválido/ausente = lixo
    });
    const excluidos = comNomeJunk.filter((c) => !alvos.includes(c)).map((c) => ({ nome: c.name, codigo: c.clienteCodigo || null, cnpj: c.cnpj || null, motivo: (c.clienteCodigo && String(c.clienteCodigo).trim()) ? 'tem-codigo' : 'cnpj-valido' }));
    let obrigApagadas = 0, empresasDeletadas = 0, soInativadas = 0; const removidos: any[] = [];
    for (const c of alvos) {
      const nObr = await this.prisma.fiscalCalendarItem.count({ where: { companyId: c.id } });
      let deletou = false;
      if (!dry) {
        await this.prisma.fiscalCalendarItem.deleteMany({ where: { companyId: c.id } }).catch(() => undefined);
        obrigApagadas += nObr;
        try { await this.prisma.company.delete({ where: { id: c.id } }); deletou = true; empresasDeletadas++; }
        catch { await this.prisma.company.update({ where: { id: c.id }, data: { active: false } }).catch(() => undefined); soInativadas++; }
      }
      removidos.push({ nome: c.name, codigo: c.clienteCodigo || null, obrigacoes: nObr, deletado: deletou });
    }
    return { dryRun: dry, candidatos: alvos.length, obrigApagadas, empresasDeletadas, soInativadas, removidos, comNomeJunkMasPreservados: excluidos };
  }

  /** Diagnóstico do casamento (por tipo: competência errada × doc ausente × folderPath). */
  async diagnosticarReconciliacao(ano = new Date().getFullYear() - 1) {
    return this.fiscalCalendar.diagnosticarReconciliacao(ano);
  }

  async reconciliarDocs(anos = [2025, 2026]) {
    const total = { entregues: 0, vencidas: 0, pendentes: 0, semMudanca: 0, empresas: 0, passes: 0 };
    for (const ano of anos) {
      await this.fiscalCalendar.garantirAno(ano).catch(() => undefined);
      // pagina por lotes: cada chamada processa até 60 empresas menos-recentes; roda várias voltas
      for (let p = 0; p < 6; p++) {
        const r: any = await this.fiscalCalendar.reconciliarPorDocumentos({ ano, limitEmpresas: 60, timeBudgetMs: 90_000 });
        total.entregues += r.marcadasEntregue ?? 0;
        total.vencidas += r.marcadasVencida ?? 0;
        total.pendentes += r.marcadasPendente ?? 0;
        total.semMudanca += r.semMudanca ?? 0;
        total.empresas += r.empresasProcessadas ?? 0;
        total.passes++;
        if ((r.empresasProcessadas ?? 0) < 60) break; // esgotou as empresas do ano
      }
    }
    return { anos, ...total };
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
      // 0b-2. REALINHA A CARTEIRA (1x) pelas pastas de "Empresas Ativas" — reativa clientes
      //       reais que a planilha não cobria. Roda ANTES do global p/ eles entrarem nele.
      if (!this.carteiraRealinhada) {
        await passo('realinharCarteira', () => this.analise.realinharCarteira());
        this.carteiraRealinhada = true;
      }
      // 0c. RECONCILIAÇÃO GLOBAL (1x, EM BACKGROUND — não bloqueia o ciclo): busca cada
      //     tipo de comprovante no Drive inteiro e casa por tipo+competência (2024/25/26).
      //     É pesada (muitas buscas); roda destacada e grava o resultado quando termina.
      if (!this.reconGlobalFeita) {
        this.reconGlobalFeita = true;
        this.reconGlobalResultado = { status: 'rodando', em: startedAt.toISOString() };
        (async () => { for (const a of [2024, 2025, 2026]) await this.fiscalCalendar.garantirAno(a).catch(() => undefined); return this.analise.reconciliarGlobalPorTipo({ anos: [2024, 2025, 2026] }); })()
          .then((r: any) => { this.reconGlobalResultado = { status: 'concluido', ...r }; this.logger.log(`reconciliarGlobal: ${r?.marcadasEntregue} entregues, ${r?.clientesComEntrega} clientes`); })
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
        // 3. RECONCILIAÇÃO TENANT-WIDE (Search API) — varre TODOS os drives por tipo de
        //    obrigação (PGDASD/DCTF/FGTS...), particionando por ano p/ furar o teto de 3000.
        //    Lê cliente+competência do caminho (webUrl). ADITIVO: só marca ENTREGUE com prova.
        //    É a fonte de verdade — cobre comprovantes que o delta não alcança (drives fora do
        //    scan por cliente). Complementa com o casamento por documentos do banco.
        await passo('reconciliarTenant', async () => {
          const ano = startedAt.getFullYear();
          // no ciclo: só os últimos 4 meses (leve) — capta recibos novos. O backfill completo
          // do ano roda 1x no boot (reconGlobalFeita) e sob demanda em /reconciliar-global.
          return this.analise.reconciliarGlobalPorTipo({ anos: [ano, ano - 1], ultimosMeses: 4 });
        });
        // 3b. (opcional/manual) SCAN COMPLETO sites→drives→delta fica no endpoint /reconciliar-app.
        //     Fora do ciclo: é pesado (varre ~460k arquivos) e a busca tenant-wide do passo 3 já
        //     cobre as entregas de forma eficiente. O scan completo confirmou que cobertura não é
        //     o gargalo (DAS/DARF faltantes = recibos não subidos, não falha de leitura).
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
