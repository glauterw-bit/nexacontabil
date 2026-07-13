import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { monofasicoPorNcm, regraMonofasico } from '../organizacao/classificacao.util';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

const O_QUE_E: Record<string, string> = {
  ICMS: 'O ICMS é o imposto estadual sobre a circulação de mercadorias — cobrado quando o produto é vendido.',
  PIS: 'O PIS é um imposto federal sobre o faturamento (a receita) da empresa.',
  COFINS: 'A COFINS é uma contribuição federal sobre o faturamento, parceira do PIS.',
  IPI: 'O IPI é o imposto federal sobre produtos industrializados — incide na saída da indústria.',
  NCM: 'O NCM é o código que classifica o produto e define como ele é tributado.',
};

/** Traduz uma inconsistência fiscal em explicação pra leigo + passos de correção. */
function comoCorrigir(erro: string) {
  const ncm = (erro.match(/NCM (\d+)/) || [])[1] ?? '';

  if (/ICMS interno .*padr[aã]o/i.test(erro)) {
    const m = erro.match(/interno ([\d.]+)%\s*\(padr[aã]o ([\d.]+)%/i);
    const aplicada = m?.[1] ?? '?', correta = m?.[2] ?? '?';
    const isento = correta === '0' || correta === '0.0';
    return {
      categoria: 'Alíquota de ICMS interna divergente', severidade: 'alta', oQueE: O_QUE_E.ICMS,
      causa: `A nota aplicou ICMS de ${aplicada}% numa operação interna, mas o padrão do NCM ${ncm} é ${correta}%.`,
      emMiudos: isento
        ? `Esta venda cobrou ${aplicada}% de ICMS, mas nas outras notas desse mesmo produto o ICMS costuma ser 0% (isento ou Simples Nacional). Ou esta nota cobrou imposto a mais, ou o produto realmente é tributado e o "padrão 0%" está errado.`
        : `Esta venda cobrou ${aplicada}% de ICMS, mas o normal para esse produto é ${correta}%. Provavelmente alguém digitou a alíquota errada — está pagando ${Number(aplicada) > Number(correta) ? 'a mais' : 'a menos'} de imposto.`,
      passos: [
        `Abra o produto (NCM ${ncm}) no Domínio e confira a tributação de ICMS.`,
        isento ? `Se for isento/cesta básica/Simples, ajuste o CST/CSOSN e zere o ICMS.` : `Ajuste a alíquota para ${correta}% (ou confirme se há redução/benefício que justifique ${aplicada}%).`,
        `Se a nota estiver certa e o padrão errado, corrija a regra no Banco de NCM.`,
      ],
    };
  }

  if (/interestadual .*fora do legal/i.test(erro)) {
    const m = erro.match(/interestadual ([\d.]+)%/i);
    return {
      categoria: 'ICMS interestadual fora da alíquota legal', severidade: 'alta', oQueE: O_QUE_E.ICMS,
      causa: `Operação interestadual com ICMS de ${m?.[1] ?? '?'}%. A lei só admite 4%, 7% ou 12%.`,
      emMiudos: `Quando a venda é para OUTRO estado, a lei só permite ICMS de 4% (produto importado), 7% ou 12% — depende de onde sai e onde chega. Esta nota usou ${m?.[1] ?? '?'}%, que não é nenhum desses. Provável erro de digitação.`,
      passos: [
        `Veja a UF de origem e destino e use a alíquota legal (4% / 7% / 12%).`,
        `Confira o CST/CSOSN e se tem ST ou DIFAL.`,
        `Corrija o lançamento no Domínio.`,
      ],
    };
  }

  // PIS / COFINS / IPI: "veio X% (esperado Y%)"
  const vm = erro.match(/(PIS|COFINS|IPI) veio ([\d.]+)%\s*\(esperado ([\d.]+)%/i);
  if (vm) {
    const imp = vm[1].toUpperCase(); const veio = vm[2]; const esp = vm[3];
    const espZero = esp === '0' || esp === '0.0';
    const taxaReal = imp === 'PIS' ? '1,65%' : imp === 'COFINS' ? '7,6%' : 'conforme a TIPI';
    return {
      categoria: `${imp} destacado diferente do padrão`, severidade: 'media', oQueE: O_QUE_E[imp],
      causa: `A nota destacou ${imp} de ${veio}%, mas o padrão do NCM ${ncm} é ${esp}%.`,
      emMiudos: espZero
        ? `Esta nota cobrou ${imp} de ${veio}%, mas nas outras notas desse produto o ${imp} aparece como 0%. Isso geralmente significa uma de duas coisas: (1) o vendedor é Simples Nacional — aí o ${imp} já está embutido no boleto único do mês (o DAS) e NÃO aparece separado na nota; ou (2) o produto é "monofásico" — o ${imp} é cobrado só na fábrica e zera na revenda. Se a empresa for Simples, o ${veio}% NÃO deveria estar aqui (erro). Se for Lucro Real, o ${veio}% está CERTO (é a alíquota normal — ${taxaReal}) e o "padrão 0%" só apareceu porque a maioria das outras notas era de Simples.`
        : `Esta nota cobrou ${imp} de ${veio}%, diferente dos ${esp}% que é o padrão desse produto. Vale conferir qual é o correto para o regime da empresa.`,
      passos: [
        `Confira o REGIME da empresa: Simples Nacional → ${imp} vai no DAS (não destaca na nota); Lucro Real → ${imp} de ${taxaReal} é o normal.`,
        `Veja se o produto (NCM ${ncm}) é monofásico — nesse caso o ${imp} na revenda é 0%.`,
        `Confirmado o erro, ajuste o CST de ${imp} e a alíquota no Domínio. Se a nota estiver certa, corrija o padrão no Banco de NCM.`,
      ],
    };
  }

  if (/sem regra/i.test(erro)) {
    return {
      categoria: 'NCM sem classificação', severidade: 'media', oQueE: O_QUE_E.NCM,
      causa: `O NCM ${ncm} ainda não tem regra de tributação no Banco de NCM.`,
      emMiudos: `O sistema ainda não conhece como esse produto (NCM ${ncm}) deve ser tributado, então não consegue conferir os impostos dele. Basta cadastrar a tributação uma vez e ele passa a validar sozinho.`,
      passos: [`Classifique o NCM ${ncm} no Banco de NCM (alíquotas e CST por segmento).`],
    };
  }

  return {
    categoria: 'Inconsistência fiscal', severidade: 'media', oQueE: '',
    causa: erro,
    emMiudos: 'O sistema encontrou uma diferença na tributação desta nota em relação ao padrão. Revise o lançamento para confirmar.',
    passos: ['Revise o lançamento e a tributação correspondente no Domínio.'],
  };
}

@Injectable()
export class PaineisService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────
  // 1. CENTRAL DE INCONSISTÊNCIAS (malha fina)
  //    Os erros fiscais reais viram lista de trabalho priorizada.
  // ───────────────────────────────────────────────────────────
  async inconsistencias(responsavel?: string) {
    const companies = await this.prisma.company.findMany({
      select: { id: true, name: true, responsavel: true, taxRegime: true, segmentoFiscal: true },
    });
    const coById = new Map(companies.map((c) => [c.id, c]));
    const filtroCo = responsavel
      ? new Set(companies.filter((c) => c.responsavel === responsavel).map((c) => c.id))
      : null;

    const docs = await this.prisma.document.findMany({
      where: { fiscalValidation: { not: null }, ...(filtroCo ? { companyId: { in: [...filtroCo] } } : {}) },
      select: { id: true, companyId: true, originalFilename: true, number: true, totalValue: true, fiscalValidation: true, issueDate: true },
    });

    const itens: any[] = [];
    const porCliente = new Map<string, { companyId: string; cliente: string; responsavel: string | null; erros: number; valor: number }>();
    let valorEnvolvido = 0;

    for (const d of docs) {
      const fv = safe(d.fiscalValidation);
      const inc: string[] = fv?.inconsistencias ?? [];
      if (!inc.length) continue;
      const co = coById.get(d.companyId);
      valorEnvolvido += d.totalValue ?? 0;
      itens.push({
        docId: d.id, companyId: d.companyId, cliente: co?.name, responsavel: co?.responsavel ?? null,
        nota: d.number, arquivo: d.originalFilename, valor: d.totalValue,
        data: d.issueDate, problemas: inc,
      });
      const cur = porCliente.get(d.companyId) ?? { companyId: d.companyId, cliente: co?.name ?? '?', responsavel: co?.responsavel ?? null, erros: 0, valor: 0 };
      cur.erros += inc.length; cur.valor += d.totalValue ?? 0;
      porCliente.set(d.companyId, cur);
    }

    // prioriza por valor envolvido (mais $ em jogo primeiro)
    itens.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    const ranking = [...porCliente.values()].sort((a, b) => b.erros - a.erros);

    return {
      totalNotas: itens.length,
      totalErros: itens.reduce((s, i) => s + i.problemas.length, 0),
      valorEnvolvido: Math.round(valorEnvolvido * 100) / 100,
      clientesAfetados: ranking.length,
      ranking: ranking.slice(0, 30),
      itens: itens.slice(0, 200),
    };
  }

  /**
   * Limpeza da carteira: desativa (active=false, REVERSÍVEL) os registros que
   * são lixo do import — pastas sem regime fiscal E sem nenhum documento,
   * clientes demo e duplicados vazios. NUNCA desativa quem tem documentos.
   */
  async limparCarteira(dryRun = false) {
    const REGIMES = new Set(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI']);
    const grouped = await this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } });
    const docsBy = new Map(grouped.map((g) => [g.companyId, g._count._all]));
    const docs = (id: string) => docsBy.get(id) ?? 0;
    const all = await this.prisma.company.findMany({ select: { id: true, name: true, taxRegime: true, active: true } });

    const isDemo = (c: any) => /\(demo\)|\bdemo\b|exemplo|sample/i.test(c.name ?? '');
    const isVazia = (c: any) => docs(c.id) === 0 && !REGIMES.has(c.taxRegime);

    // duplicados: mesmo nome → mantém o com mais docs, marca os vazios restantes
    const byName = new Map<string, any[]>();
    for (const c of all) { const k = (c.name ?? '').trim().toUpperCase(); if (!byName.has(k)) byName.set(k, []); byName.get(k)!.push(c); }
    const dupExtras: any[] = [];
    for (const arr of byName.values()) {
      if (arr.length > 1) {
        const sorted = [...arr].sort((a, b) => docs(b.id) - docs(a.id));
        dupExtras.push(...sorted.slice(1).filter((c) => docs(c.id) === 0));
      }
    }

    const remover = new Map<string, any>();
    for (const c of all) if ((isDemo(c) || isVazia(c)) && docs(c.id) === 0) remover.set(c.id, c);
    for (const c of dupExtras) remover.set(c.id, c);
    const ids = [...remover.keys()];

    if (!dryRun && ids.length) {
      await this.prisma.company.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    }
    return {
      dryRun,
      total: all.length,
      desativados: ids.length,
      demo: all.filter(isDemo).length,
      pastasVazias: all.filter(isVazia).length,
      duplicadosVazios: dupExtras.length,
      ativosRestantes: all.length - ids.length,
    };
  }

  // Painel gerencial: número-herói + KPIs + saúde da equipe num call só.
  async gerencial() {
    const [prod, inc, prazos] = await Promise.all([
      this.produtividade(), this.inconsistencias(), this.prazos(),
    ]);
    const atendAbertos = await this.prisma.atendimento.count({ where: { status: { not: 'resolvido' } } });
    const equipe = prod.equipe.filter((e: any) => !e.responsavel.includes('Sem responsável'));
    return {
      hero: {
        emRisco: prazos.atrasadas + prazos.proximas7dias,
        atrasadas: prazos.atrasadas,
        proximas7dias: prazos.proximas7dias,
      },
      kpis: {
        docs: prod.totalDocs,
        notasErro: inc.totalNotas,
        erros: inc.totalErros,
        valorEnvolvido: inc.valorEnvolvido,
        clientesComErro: inc.clientesAfetados,
        atendAbertos,
        analistas: prod.analistas,
        clientes: prod.equipe.reduce((s: number, e: any) => s + (e.clientesAtivos ?? 0), 0),
      },
      equipe,
      topClientesErro: inc.ranking.slice(0, 8),
      obrigacoesPorTipo: prazos.porTipo,
      insights: prod.insights,
    };
  }

  /**
   * CENTRAL DE OPERAÇÃO — a situação TOTAL da carteira num lugar só:
   * documentos, declarações (entregas), pendências e inconsistências,
   * com um semáforo por cliente (verde/amarelo/vermelho). Leitura única.
   */
  async operacao(competencia?: string) {
    // default: o mês JÁ PROCESSADO mais recente (com recibos verificados),
    // senão o mês atual. Evita mostrar "0 entregues" num mês ainda não fechado.
    let comp = competencia;
    if (!comp) {
      // mês mais recente com ENTREGAS reais (recibo achado); senão o atual
      const ult = await this.prisma.fluxoEstado.findFirst({
        where: { departamento: 'fiscal', reciboEncontrado: true },
        orderBy: { competencia: 'desc' }, select: { competencia: true },
      });
      comp = ult?.competencia ?? new Date().toISOString().slice(0, 7);
    }
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, taxRegime: true, responsavel: true, sharepointItemId: true, sharepointAnalisadoEm: true },
    });
    const ids = companies.map((c) => c.id);
    const nowComp = new Date().toISOString().slice(0, 7);
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
    const [docs, fluxos, ultimaLeitura, ultimoDoc, obrigMes] = await Promise.all([
      this.prisma.document.findMany({ where: { companyId: { in: ids }, extractedData: { not: null } }, select: { companyId: true, totalValue: true, extractedData: true, fiscalValidation: true } }),
      this.prisma.fluxoEstado.findMany({ where: { departamento: 'fiscal', competencia: comp, companyId: { in: ids }, reciboCheckedAt: { not: null } }, select: { companyId: true, reciboEncontrado: true } }),
      // frescor: quando o drive foi lido pela última vez e o doc mais novo capturado
      this.prisma.company.aggregate({ where: { active: true }, _max: { sharepointAnalisadoEm: true } }),
      this.prisma.document.aggregate({ where: { companyId: { in: ids } }, _max: { createdAt: true } }),
      // obrigações do MÊS CORRENTE (fonte única, mesma tabela do calendário)
      this.prisma.fiscalCalendarItem.findMany({
        where: { companyId: { in: ids }, dataVencimento: { gte: inicioMes, lte: fimMes } },
        select: { status: true, dataVencimento: true },
      }),
    ]);
    const reciboBy = new Map(fluxos.map((f) => [f.companyId, f.reciboEncontrado]));
    const mesProcessado = fluxos.length > 0; // só pune declaração se o mês já foi verificado

    type Ag = { docs: number; entradas: number; saidas: number; inc: number; valorInc: number };
    const ag = new Map<string, Ag>();
    for (const d of docs) {
      const a = ag.get(d.companyId) ?? { docs: 0, entradas: 0, saidas: 0, inc: 0, valorInc: 0 };
      a.docs++;
      const nf = safe(d.extractedData);
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      if (['1', '2', '3'].includes(dir)) a.entradas++; else if (['5', '6', '7'].includes(dir)) a.saidas++;
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) { a.inc += inc.length; a.valorInc += d.totalValue ?? 0; }
      ag.set(d.companyId, a);
    }

    const REGIMES = new Set(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI']);
    let verdes = 0, amarelos = 0, vermelhos = 0;
    // vermelho tem DOIS motivos bem diferentes p/ o gestor decidir a ação: falta documento
    // (cliente não mandou / não capturamos → cobrar) vs erro fiscal (mandou, mas a nota tem
    // inconsistência → corrigir). Contamos separado p/ a tela mostrar dois cartões distintos.
    let vermFalta = 0, vermErro = 0;
    let totDocs = 0, comDocs = 0, semDocs = 0, semEntradas = 0, comInc = 0, declEntregue = 0;
    let totInc = 0, valorInc = 0, clientesInc = 0;
    const clientes = companies.map((c) => {
      const a = ag.get(c.id) ?? { docs: 0, entradas: 0, saidas: 0, inc: 0, valorInc: 0 };
      const entregue = reciboBy.get(c.id) ?? false;
      totDocs += a.docs; if (a.docs > 0) comDocs++; else semDocs++;
      if (a.docs > 0 && a.entradas === 0) semEntradas++;
      if (a.inc > 0) { comInc++; clientesInc++; totInc += a.inc; valorInc += a.valorInc; }
      if (entregue) declEntregue++;
      // semáforo: vermelho = sem docs ou muita inconsistência; amarelo = sem entradas / alguma inconsist / não entregou; verde = ok
      let status: 'verde' | 'amarelo' | 'vermelho';
      // motivo do vermelho — o que o gestor faz a respeito:
      //   'falta_documento' → cobrar o cliente/reativar a entrada
      //   'erro_fiscal'     → o analista corrige a nota
      let motivo: 'falta_documento' | 'erro_fiscal' | null = null;
      const pend: string[] = [];
      // SEMÁFORO baseado só em sinais CONFIÁVEIS: tem documento + sem erro fiscal.
      // (entradas e recibo entram como info, não derrubam o status — são sinais
      //  incompletos: entradas vêm pelo Onvio, e nem todo recibo está no drive)
      const declPendente = mesProcessado && !entregue;
      if (a.docs === 0) pend.push('sem documentos');
      if (a.docs > 0 && a.entradas === 0) pend.push('sem entradas');
      if (a.inc > 0) pend.push(`${a.inc} inconsistência(s)`);
      if (!REGIMES.has(c.taxRegime ?? '')) pend.push('sem regime');
      if (declPendente) pend.push('declaração não entregue');
      if (a.docs === 0) { status = 'vermelho'; motivo = 'falta_documento'; }
      else if (a.inc >= 5) { status = 'vermelho'; motivo = 'erro_fiscal'; }
      else if (a.inc > 0) { status = 'amarelo'; motivo = 'erro_fiscal'; }
      else status = 'verde';
      if (status === 'verde') verdes++;
      else if (status === 'amarelo') amarelos++;
      else { vermelhos++; if (motivo === 'falta_documento') vermFalta++; else vermErro++; }
      return { companyId: c.id, cliente: c.name, regime: c.taxRegime, responsavel: c.responsavel, docs: a.docs, inconsistencias: a.inc, valorInc: Math.round(a.valorInc * 100) / 100, declaracaoEntregue: entregue, status, motivo, pendencias: pend };
    }).sort((x, y) => ({ vermelho: 0, amarelo: 1, verde: 2 } as any)[x.status] - ({ vermelho: 0, amarelo: 1, verde: 2 } as any)[y.status] || y.inconsistencias - x.inconsistencias);

    // COBERTURA DE SINCRONIZAÇÃO da carteira toda (o gestor vê num relance se o drive
    // está sendo lido): ok = lido nos últimos 2 dias · desatualizado > 2 dias · nunca · sem pasta.
    const staleCut = new Date(Date.now() - 2 * 86400000);
    let syncOk = 0, syncStale = 0, syncNunca = 0, syncSemPasta = 0;
    for (const c of companies) {
      if (!c.sharepointItemId) { syncSemPasta++; continue; }
      if (!c.sharepointAnalisadoEm) syncNunca++;
      else if (new Date(c.sharepointAnalisadoEm) < staleCut) syncStale++;
      else syncOk++;
    }

    // OBRIGAÇÕES DO MÊS CORRENTE (agregado da carteira)
    const ENTREGUE_OB = new Set(['paga', 'isenta', 'entregue']);
    const nowD = new Date();
    let obTotal = 0, obVencidas = 0, obProximas = 0, obEntregues = 0;
    const em7 = new Date(nowD.getTime() + 7 * 86400000);
    for (const o of obrigMes) {
      obTotal++;
      const venc = new Date(o.dataVencimento);
      if (ENTREGUE_OB.has(o.status)) { obEntregues++; continue; }
      if (o.status === 'vencida' || venc < nowD) obVencidas++;
      else if (venc <= em7) obProximas++;
    }

    // RESUMO POR ANALISTA — quem tem mais cliente crítico (para o gestor equilibrar a carga)
    const porAnalistaMap = new Map<string, { responsavel: string; clientes: number; verdes: number; amarelos: number; vermelhos: number; inconsistencias: number }>();
    for (const c of clientes) {
      const r = c.responsavel || 'Sem responsável';
      let a = porAnalistaMap.get(r);
      if (!a) { a = { responsavel: r, clientes: 0, verdes: 0, amarelos: 0, vermelhos: 0, inconsistencias: 0 }; porAnalistaMap.set(r, a); }
      a.clientes++;
      if (c.status === 'verde') a.verdes++; else if (c.status === 'amarelo') a.amarelos++; else a.vermelhos++;
      a.inconsistencias += c.inconsistencias;
    }
    const porAnalista = [...porAnalistaMap.values()].sort((x, y) => y.vermelhos - x.vermelhos || y.amarelos - x.amarelos);

    return {
      competencia: comp,
      mesProcessado,
      totalClientes: companies.length,
      // frescor dos dados: última leitura do drive + doc mais novo capturado
      frescor: {
        driveLidoEm: ultimaLeitura._max.sharepointAnalisadoEm ?? null,
        ultimoDocEm: ultimoDoc._max.createdAt ?? null,
      },
      // cobertura de leitura do drive na carteira inteira
      sincronizacao: { ok: syncOk, desatualizado: syncStale, nunca: syncNunca, semPasta: syncSemPasta },
      // obrigações do mês corrente (mês de calendário, não a competência processada)
      obrigacoesMes: { mes: nowComp, total: obTotal, vencidas: obVencidas, proximas7: obProximas, entregues: obEntregues },
      porAnalista,
      semaforo: { verdes, amarelos, vermelhos, vermelhoFalta: vermFalta, vermelhoErro: vermErro },
      documentos: { total: totDocs, clientesComDocs: comDocs, clientesSemDocs: semDocs },
      declaracoes: { entregues: declEntregue, pendentes: companies.length - declEntregue },
      pendencias: { clientes: amarelos + vermelhos, semDocumentos: semDocs, semEntradas },
      inconsistencias: { notas: totInc, valor: Math.round(valorInc * 100) / 100, clientes: clientesInc },
      clientes,
    };
  }

  /**
   * CENTRAL DE FARÓIS — alertas inteligentes de Risco & Oportunidade:
   * 1) sublimite do Simples · 2) queda de faturamento · 3) monofásico
   * (economia) · 4) concentração de receita. Leitura única, segura.
   */
  async farois() {
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, taxRegime: true },
    });
    const coById = new Map(companies.map((c) => [c.id, c]));
    const docs = await this.prisma.document.findMany({
      where: { companyId: { in: companies.map((c) => c.id) }, extractedData: { not: null } },
      select: { companyId: true, totalValue: true, issueDate: true, extractedData: true },
    });
    const ecfItens = await this.prisma.fiscalCalendarItem.findMany({
      where: { tipo: { in: ['ECF', 'ECD'] } },
      select: { companyId: true, tipo: true, status: true, dataVencimento: true },
    });

    type C = { meses: Map<string, number>; mono: number; monoNotas: number; total: number };
    const byClient = new Map<string, C>();
    for (const d of docs) {
      const nf = safe(d.extractedData);
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      const saida = ['5', '6', '7'].includes(dir) || dir === '';
      const v = d.totalValue ?? nf?.totais?.produtos ?? 0;
      const c = byClient.get(d.companyId) ?? { meses: new Map(), mono: 0, monoNotas: 0, total: 0 };
      if (saida) {
        c.total += v;
        if (d.issueDate) { const comp = new Date(d.issueDate).toISOString().slice(0, 7); c.meses.set(comp, (c.meses.get(comp) ?? 0) + v); }
      }
      let temMono = false;
      for (const it of (nf?.itens ?? [])) { if (monofasicoPorNcm(it.ncm)) { c.mono += it.valor ?? 0; temMono = true; } }
      if (temMono) c.monoNotas++;
      byClient.set(d.companyId, c);
    }

    // 1) SUBLIMITE DO SIMPLES (RBT12 = soma dos 12 meses mais recentes)
    const sublimite: any[] = [];
    for (const [id, c] of byClient) {
      const co = coById.get(id); if (co?.taxRegime !== 'SIMPLES_NACIONAL') continue;
      const comps = [...c.meses.keys()].sort().reverse();
      const rbt12 = comps.slice(0, 12).reduce((s, k) => s + (c.meses.get(k) ?? 0), 0);
      const pct = Math.round((rbt12 / 4800000) * 10000) / 100;
      if (rbt12 > 0) sublimite.push({ companyId: id, nome: co.name, rbt12: r2(rbt12), pctLimite: pct, status: pct >= 95 ? 'vermelho' : pct >= 80 ? 'amarelo' : 'verde' });
    }
    sublimite.sort((a, b) => b.pctLimite - a.pctLimite);

    // 2) QUEDA DE FATURAMENTO — só clientes com MOVIMENTO RECENTE.
    // (senão flagra cliente cujos dados acabam em 2022 = sem dado novo, não queda)
    const cn = (comp: string) => { const [y, m] = comp.split('-').map(Number); return y * 12 + m; };
    let maxGlobal = 0;
    for (const c of byClient.values()) for (const k of c.meses.keys()) maxGlobal = Math.max(maxGlobal, cn(k));
    const queda: any[] = [];
    for (const [id, c] of byClient) {
      const comps = [...c.meses.keys()].sort();
      if (comps.length < 4) continue;
      const ultimaComp = comps[comps.length - 1];
      if (cn(ultimaComp) < maxGlobal - 2) continue; // só os ativos (até 2 meses do mais recente)
      const ultimo = c.meses.get(ultimaComp) ?? 0;
      const ant = comps.slice(Math.max(0, comps.length - 7), comps.length - 1).map((k) => c.meses.get(k) ?? 0);
      const media = ant.reduce((a, b) => a + b, 0) / ant.length;
      if (media > 0 && ultimo < media * 0.7) {
        queda.push({ companyId: id, nome: coById.get(id)?.name, ultimaComp, ultimoMes: r2(ultimo), mediaAnterior: r2(media), quedaPct: Math.round((1 - ultimo / media) * 100) });
      }
    }
    queda.sort((a, b) => b.quedaPct - a.quedaPct);

    // 3) MONOFÁSICO (oportunidade de economia PIS/COFINS)
    const mono: any[] = []; let monoTotal = 0, monoNotas = 0;
    for (const [id, c] of byClient) { if (c.mono > 0) { mono.push({ companyId: id, nome: coById.get(id)?.name, valorMono: r2(c.mono), notasMono: c.monoNotas }); monoTotal += c.mono; monoNotas += c.monoNotas; } }
    mono.sort((a, b) => b.valorMono - a.valorMono);

    // 4) CONCENTRAÇÃO DE RECEITA (risco do escritório)
    const totais = [...byClient.entries()].map(([id, c]) => ({ companyId: id, nome: coById.get(id)?.name, valor: c.total })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
    const receitaTotal = totais.reduce((s, x) => s + x.valor, 0) || 1;
    const top5 = totais.slice(0, 5).reduce((s, x) => s + x.valor, 0);
    const top10 = totais.slice(0, 10).reduce((s, x) => s + x.valor, 0);

    // 5) PRAZOS DA REFORMA — 2º semestre/2026 (datas com rejeição/obrigação)
    const REGULAR = ['LUCRO_PRESUMIDO', 'PRESUMIDO', 'LUCRO_REAL', 'REAL'];
    const SIMPLES = ['SIMPLES_NACIONAL', 'SIMPLES', 'MEI'];
    const cnAtual = new Date().getFullYear() * 12 + (new Date().getMonth() + 1);

    // 5a) ECF (vence 31/07/2026) — clientes de regime regular e o status do item no calendário
    const ecfByCo = new Map<string, any>();
    for (const e of ecfItens) if (e.tipo === 'ECF') ecfByCo.set(e.companyId, e);
    const ecf = companies
      .filter((c) => REGULAR.includes((c.taxRegime || '').toUpperCase()))
      .map((c) => {
        const item = ecfByCo.get(c.id);
        const st = item?.status ?? 'sem_item';
        return { companyId: c.id, nome: c.name, regime: c.taxRegime, status: st, entregue: st === 'paga' || st === 'entregue' };
      })
      .sort((a, b) => Number(a.entregue) - Number(b.entregue));

    // 5b) IBS/CBS (rejeição a partir de 03/08/2026) — nas notas de SAÍDA de 2026
    //     emitidas pelo próprio cliente, o grupo gIBSCBS/cClassTrib já aparece?
    const ibsPorCliente = new Map<string, { com: number; sem: number }>();
    for (const d of docs) {
      const nf = safe(d.extractedData);
      if (!d.issueDate || new Date(d.issueDate) < new Date(2026, 0, 1)) continue;
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      if (!['5', '6', '7'].includes(dir)) continue; // só saídas (emitidas pelo cliente)
      const co = coById.get(d.companyId);
      if (!co || !REGULAR.includes((co.taxRegime || '').toUpperCase())) continue;
      // XMLs varridos antes do detector não têm o campo — não contam como risco (evita falso positivo)
      if (typeof nf?.temIBSCBS !== 'boolean') continue;
      const acc = ibsPorCliente.get(d.companyId) ?? { com: 0, sem: 0 };
      if (nf.temIBSCBS) acc.com++; else acc.sem++;
      ibsPorCliente.set(d.companyId, acc);
    }
    const ibscbs = companies
      .filter((c) => REGULAR.includes((c.taxRegime || '').toUpperCase()))
      .map((c) => {
        const acc = ibsPorCliente.get(c.id);
        const status = !acc ? 'sem_dados' : acc.com > 0 ? 'ok' : 'risco';
        return { companyId: c.id, nome: c.name, regime: c.taxRegime, status, notas2026Com: acc?.com ?? 0, notas2026Sem: acc?.sem ?? 0 };
      })
      .sort((a, b) => ({ risco: 0, sem_dados: 1, ok: 2 } as any)[a.status] - ({ risco: 0, sem_dados: 1, ok: 2 } as any)[b.status]);

    // 5c) NFS-e nacional (Res. CGSN 189/2026): ME/EPP do Simples obrigadas em 01/09/2026.
    //     Prioriza quem já emite NFS-e (docs tipo nfse) e está ativo.
    const emiteNfse = new Set<string>();
    const ativos = new Set<string>();
    for (const d of docs) {
      const nf = safe(d.extractedData);
      if (nf?.tipo === 'nfse') emiteNfse.add(d.companyId);
      if (d.issueDate) {
        const dt = new Date(d.issueDate);
        if (dt.getFullYear() * 12 + (dt.getMonth() + 1) >= cnAtual - 3) ativos.add(d.companyId);
      }
    }
    const nfseNacional = companies
      .filter((c) => SIMPLES.includes((c.taxRegime || '').toUpperCase()))
      .map((c) => ({ companyId: c.id, nome: c.name, regime: c.taxRegime, emiteNfse: emiteNfse.has(c.id), ativo: ativos.has(c.id) }))
      .sort((a, b) => Number(b.emiteNfse) - Number(a.emiteNfse) || Number(b.ativo) - Number(a.ativo));

    return {
      reforma2026: {
        ecf: { prazo: '2026-07-31', pendentes: ecf.filter((x) => !x.entregue).length, total: ecf.length, clientes: ecf.slice(0, 30) },
        ibscbs: { prazo: '2026-08-03', emRisco: ibscbs.filter((x) => x.status === 'risco').length, semDados: ibscbs.filter((x) => x.status === 'sem_dados').length, total: ibscbs.length, clientes: ibscbs.slice(0, 30) },
        nfseNacional: { prazo: '2026-09-01', total: nfseNacional.length, prestadores: nfseNacional.filter((x) => x.emiteNfse).length, clientes: nfseNacional.slice(0, 40) },
      },
      sublimiteSimples: { emRisco: sublimite.filter((s) => s.status !== 'verde').length, total: sublimite.length, clientes: sublimite.slice(0, 25) },
      quedaFaturamento: { emQueda: queda.length, clientes: queda.slice(0, 25) },
      monofasico: { valorTotal: r2(monoTotal), notas: monoNotas, clientesAfetados: mono.length, clientes: mono.slice(0, 20) },
      concentracao: { receitaTotal: r2(receitaTotal), top5Pct: Math.round((top5 / receitaTotal) * 1000) / 10, top10Pct: Math.round((top10 / receitaTotal) * 1000) / 10, topClientes: totais.slice(0, 10).map((x) => ({ ...x, valor: r2(x.valor), pct: Math.round((x.valor / receitaTotal) * 1000) / 10 })) },
    };
  }

  /**
   * OPORTUNIDADE MONOFÁSICA por cliente — o serviço de maior valor da carteira.
   * Cruza os XMLs de saída com a base LEGAL de monofásico (Lei 10.485/10.147...):
   *  - valorMono: receita de revenda de produtos monofásicos.
   *  - recuperavelReais: PIS/COFINS EFETIVAMENTE cobrado na revenda (recolhimento
   *    indevido, recuperável em até 5 anos) — número de FATO, tirado das notas.
   *  - Para Simples: aponta a segregação no PGDAS (economia recorrente no DAS).
   */
  async monofasicoOportunidade() {
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, taxRegime: true, responsavel: true },
    });
    const coById = new Map(companies.map((c) => [c.id, c]));
    const ids = companies.map((c) => c.id);
    const docs = await this.prisma.document.findMany({
      where: { companyId: { in: ids }, extractedData: { not: null } },
      select: { companyId: true, extractedData: true },
    });

    type Ag = { valorMono: number; notasMono: number; recuperavel: number; notasIndevidas: number; grupos: Set<string> };
    const ag = new Map<string, Ag>();
    for (const d of docs) {
      const nf = safe(d.extractedData);
      for (const it of (nf?.itens ?? [])) {
        const reg = regraMonofasico(it.ncm);
        if (!reg) continue;
        const cfop = String(it.cfop ?? '');
        if (!['5', '6', '7'].includes(cfop[0])) continue; // só revenda (saída)
        const a = ag.get(d.companyId) ?? { valorMono: 0, notasMono: 0, recuperavel: 0, notasIndevidas: 0, grupos: new Set<string>() };
        const valor = it.valor ?? 0;
        a.valorMono += valor; a.notasMono++; a.grupos.add(reg.grupo);
        const cst = String(it.cst ?? '').trim();
        const isSimples = cst.length === 3 || coById.get(d.companyId)?.taxRegime === 'SIMPLES_NACIONAL';
        const pc = (it.pis ?? 0) + (it.cofins ?? 0);
        // recolhimento indevido só faz sentido fora do Simples (no Simples é via PGDAS)
        if (!isSimples && pc > 0.01) { a.recuperavel += valor * pc / 100; a.notasIndevidas++; }
        ag.set(d.companyId, a);
      }
    }

    let totalValorMono = 0, totalRecuperavel = 0;
    const clientes = [...ag.entries()].map(([id, a]) => {
      totalValorMono += a.valorMono; totalRecuperavel += a.recuperavel;
      const co = coById.get(id);
      const simples = co?.taxRegime === 'SIMPLES_NACIONAL';
      return {
        companyId: id, nome: co?.name, regime: co?.taxRegime, responsavel: co?.responsavel,
        grupos: [...a.grupos],
        valorMono: r2(a.valorMono), notasMono: a.notasMono,
        recuperavelReais: r2(a.recuperavel), notasIndevidas: a.notasIndevidas,
        // Simples: estimativa de economia recorrente ao segregar a receita monofásica
        // no PGDAS (~PIS+COFINS do Anexo I, faixa média). É estimativa, confirmar por faixa.
        economiaSimplesAnoEstimada: simples ? r2(a.valorMono * 0.0328) : 0,
        acao: simples
          ? 'Segregar a receita monofásica no PGDAS-D → reduz o DAS todo mês. Restituir/compensar os últimos 5 anos.'
          : a.recuperavel > 0
            ? 'Recuperar o PIS/COFINS cobrado indevidamente na revenda (últimos 5 anos) + parar de recolher.'
            : 'Revenda já sem PIS/COFINS — conferir se há créditos anteriores a recuperar.',
      };
    }).sort((x, y) => (y.recuperavelReais + y.economiaSimplesAnoEstimada) - (x.recuperavelReais + x.economiaSimplesAnoEstimada) || y.valorMono - x.valorMono);

    return {
      totalClientes: clientes.length,
      totalValorMono: r2(totalValorMono),
      totalRecuperavelReais: r2(totalRecuperavel),
      totalEconomiaSimplesAno: r2(clientes.reduce((s, c) => s + c.economiaSimplesAnoEstimada, 0)),
      clientes,
    };
  }

  /** DETALHE do monofásico de UM cliente — base do laudo (PDF): notas com PIS/COFINS
   *  cobrado na revenda (recuperável), agrupadas por lei, com totais. */
  async monofasicoCliente(companyId: string) {
    const co = await this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, cnpj: true, taxRegime: true, uf: true } });
    if (!co) throw new NotFoundException('Cliente não encontrado');
    const simples = co.taxRegime === 'SIMPLES_NACIONAL';
    const docs = await this.prisma.document.findMany({
      where: { companyId, extractedData: { not: null } },
      select: { number: true, issueDate: true, extractedData: true },
    });
    const grupos = new Set<string>(); const leis = new Set<string>();
    let valorMono = 0, notasMono = 0, recuperavel = 0;
    const notas: any[] = [];
    for (const d of docs) {
      const nf = safe(d.extractedData);
      let indevidoNota = 0, monoNota = 0, pcMax = 0;
      for (const it of (nf?.itens ?? [])) {
        const reg = regraMonofasico(it.ncm);
        if (!reg) continue;
        const cfop = String(it.cfop ?? '');
        if (!['5', '6', '7'].includes(cfop[0])) continue;
        grupos.add(reg.grupo); leis.add(reg.lei);
        const v = it.valor ?? 0; monoNota += v;
        const cst = String(it.cst ?? '').trim();
        const isSimplesNota = cst.length === 3 || simples;
        const pc = (it.pis ?? 0) + (it.cofins ?? 0);
        if (!isSimplesNota && pc > 0.01) { indevidoNota += v * pc / 100; pcMax = Math.max(pcMax, pc); }
      }
      if (monoNota > 0.005) {
        valorMono += monoNota; notasMono++;
        if (indevidoNota > 0.005) recuperavel += indevidoNota;
        notas.push({ numero: nf?.numero ?? d.number, data: d.issueDate, valorMono: r2(monoNota), pisCofinsPct: pcMax || null, recuperavel: r2(indevidoNota) });
      }
    }
    notas.sort((a, b) => b.recuperavel - a.recuperavel || b.valorMono - a.valorMono);
    return {
      empresa: { nome: co.name, cnpj: co.cnpj, regime: co.taxRegime, uf: co.uf },
      simples, grupos: [...grupos], leis: [...leis],
      valorMono: r2(valorMono), notasMono, recuperavelReais: r2(recuperavel),
      economiaSimplesAnoEstimada: simples ? r2(valorMono * 0.0328) : 0,
      acao: simples
        ? 'Segregar a receita monofásica no PGDAS-D (reduz o DAS mensal) e pedir restituição/compensação dos últimos 5 anos.'
        : 'Recuperar o PIS/COFINS recolhido indevidamente na revenda (últimos 5 anos) e parar de recolher.',
      notas: notas.slice(0, 200),
    };
  }

  /**
   * VISÃO 360 DO CLIENTE — para o gestor clicar numa obrigação e ver TUDO: o que foi
   * entregue, o que falta, e uma análise fiscal + contábil consolidada.
   */
  async clienteVisao360(companyId: string) {
    const co = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true, taxRegime: true, responsavel: true, uf: true, segmentoFiscal: true },
    });
    if (!co) throw new NotFoundException('Cliente não encontrado');
    const now = new Date();
    const anoAtual = String(now.getFullYear());
    const [obrig, docs] = await Promise.all([
      this.prisma.fiscalCalendarItem.findMany({ where: { companyId, competencia: { startsWith: anoAtual } }, orderBy: { dataVencimento: 'asc' }, select: { tipo: true, descricao: true, competencia: true, dataVencimento: true, status: true } }),
      this.prisma.document.findMany({ where: { companyId, extractedData: { not: null } }, select: { totalValue: true, issueDate: true, extractedData: true, fiscalValidation: true } }),
    ]);

    // ── OBRIGAÇÕES: entregues / pendentes / vencidas ──
    const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
    const entregues: any[] = [], pendentes: any[] = [], vencidas: any[] = [];
    for (const o of obrig) {
      const item = { tipo: o.tipo, descricao: o.descricao, competencia: o.competencia, vencimento: o.dataVencimento, status: o.status };
      if (ENTREGUE.has(o.status)) entregues.push(item);
      else if (o.status === 'vencida' || new Date(o.dataVencimento) < now) vencidas.push(item);
      else pendentes.push(item);
    }

    // ── ANÁLISE FISCAL: faturamento, impostos, entradas/saídas, inconsistências, monofásico ──
    let faturamento = 0, entradas = 0, saidas = 0, tIcms = 0, tPis = 0, tCofins = 0, tIpi = 0;
    let inconsistencias = 0, notasComErro = 0, valorMono = 0, notasMono = 0;
    const mesesComDoc = new Set<string>();
    for (const d of docs) {
      const nf = safe(d.extractedData);
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      const saida = ['5', '6', '7'].includes(dir);
      if (saida) { saidas++; faturamento += d.totalValue ?? nf?.totais?.produtos ?? 0; } else if (['1', '2', '3'].includes(dir)) entradas++;
      tIcms += nf?.totais?.icms ?? 0; tPis += nf?.totais?.pis ?? 0; tCofins += nf?.totais?.cofins ?? 0; tIpi += nf?.totais?.ipi ?? 0;
      if (d.issueDate) mesesComDoc.add(new Date(d.issueDate).toISOString().slice(0, 7));
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) { inconsistencias += inc.length; notasComErro++; }
      for (const it of (nf?.itens ?? [])) { if (monofasicoPorNcm(it.ncm) && saida) { valorMono += it.valor ?? 0; notasMono++; } }
    }

    // ── SAÚDE / SEMÁFORO ──
    let status: 'verde' | 'amarelo' | 'vermelho';
    if (docs.length === 0 || vencidas.length > 0) status = 'vermelho';
    else if (inconsistencias > 0 || pendentes.length > 0) status = 'amarelo';
    else status = 'verde';

    return {
      empresa: { nome: co.name, cnpj: co.cnpj, regime: co.taxRegime, responsavel: co.responsavel, uf: co.uf, segmento: co.segmentoFiscal },
      status,
      obrigacoes: { entregues, pendentes, vencidas, totalAno: obrig.length, pctEntrega: obrig.length ? Math.round((entregues.length / obrig.length) * 100) : 0 },
      documentos: { total: docs.length, entradas, saidas, mesesComMovimento: [...mesesComDoc].sort() },
      analiseFiscal: {
        faturamento: r2(faturamento),
        impostos: { icms: r2(tIcms), pis: r2(tPis), cofins: r2(tCofins), ipi: r2(tIpi), total: r2(tIcms + tPis + tCofins + tIpi) },
        cargaTributaria: faturamento > 0 ? Math.round(((tIcms + tPis + tCofins + tIpi) / faturamento) * 1000) / 10 : 0,
        inconsistencias, notasComErro,
        monofasico: { valor: r2(valorMono), notas: notasMono },
      },
      analiseContabil: {
        entradasFaltando: saidas > 0 && entradas === 0,
        semMovimentoRecente: !mesesComDoc.has(now.toISOString().slice(0, 7)),
        observacao: entradas === 0 && saidas > 0 ? 'Sem notas de ENTRADA — crédito de ICMS/PIS/COFINS incompleto; conciliação e apuração ficam parciais.' : 'Movimento de entradas e saídas presente.',
      },
    };
  }

  // Detalhe dos erros de UM cliente, com causa + como corrigir.
  async clienteErros(companyId: string) {
    const empresa = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, responsavel: true, taxRegime: true, segmentoFiscal: true },
    });
    const docs = await this.prisma.document.findMany({
      where: { companyId, fiscalValidation: { not: null } },
      select: { id: true, number: true, originalFilename: true, totalValue: true, issueDate: true, fiscalValidation: true },
    });
    const notas: any[] = [];
    const porTipo = new Map<string, number>();
    let valorEnvolvido = 0, totalErros = 0;
    for (const d of docs) {
      const inc: string[] = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (!inc.length) continue;
      const problemas = inc.map(comoCorrigir);
      for (const p of problemas) porTipo.set(p.categoria, (porTipo.get(p.categoria) ?? 0) + 1);
      totalErros += problemas.length;
      valorEnvolvido += d.totalValue ?? 0;
      notas.push({ docId: d.id, nota: d.number, arquivo: d.originalFilename, valor: d.totalValue, data: d.issueDate, problemas });
    }
    notas.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    return {
      empresa,
      totalNotas: notas.length,
      totalErros,
      valorEnvolvido: Math.round(valorEnvolvido * 100) / 100,
      resumoPorTipo: [...porTipo.entries()].map(([categoria, qtd]) => ({ categoria, qtd })).sort((a, b) => b.qtd - a.qtd),
      notas: notas.slice(0, 100),
    };
  }

  // ───────────────────────────────────────────────────────────
  // 2. MAPA DE PRAZOS & SLA
  //    Todas as obrigações na linha do tempo, com alerta de atraso.
  // ───────────────────────────────────────────────────────────
  async prazos(responsavel?: string) {
    const now = new Date();
    const ini = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fim = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    // FONTE ÚNICA DO CALENDÁRIO: fiscal_calendar_items (mesma tabela que a "Regerar
    // calendário" preenche, com as datas corretas — FGTS dia 20, DCTFWeb último dia útil).
    // O responsável mora na empresa, então filtramos por companyId.
    let companyIds: string[] | null = null;
    if (responsavel) {
      const cos = await this.prisma.company.findMany({ where: { responsavel }, select: { id: true } });
      companyIds = cos.map((c) => c.id);
    }
    const obrigs = await this.prisma.fiscalCalendarItem.findMany({
      where: {
        dataVencimento: { gte: ini, lte: fim },
        ...(companyIds ? { companyId: { in: companyIds } } : {}),
      },
      select: { companyId: true, descricao: true, tipo: true, dataVencimento: true, status: true },
    });

    const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
    const isEntregue = (o: any) => ENTREGUE.has(o.status);
    const isAtrasada = (o: any) => !isEntregue(o) && (o.status === 'vencida' || new Date(o.dataVencimento) < now);

    // agrupa por dia + tipo
    const porData = new Map<string, { data: string; tipos: Map<string, { total: number; atrasadas: number }> }>();
    let atrasadas = 0, proximas = 0, entregues = 0;
    for (const o of obrigs) {
      const dia = new Date(o.dataVencimento).toISOString().slice(0, 10);
      if (!porData.has(dia)) porData.set(dia, { data: dia, tipos: new Map() });
      const bucket = porData.get(dia)!;
      const t = bucket.tipos.get(o.tipo) ?? { total: 0, atrasadas: 0 };
      t.total++;
      if (isAtrasada(o)) { t.atrasadas++; atrasadas++; }
      bucket.tipos.set(o.tipo, t);
      const dd = new Date(o.dataVencimento);
      if (isEntregue(o)) entregues++;
      else if (dd >= now && dd <= new Date(now.getTime() + 7 * 864e5)) proximas++;
    }

    const timeline = [...porData.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ data: d.data, tipos: [...d.tipos.entries()].map(([type, v]) => ({ type, ...v })) }));

    // resumo por tipo
    const porTipo = new Map<string, { total: number; atrasadas: number }>();
    for (const o of obrigs) {
      const t = porTipo.get(o.tipo) ?? { total: 0, atrasadas: 0 };
      t.total++; if (isAtrasada(o)) t.atrasadas++;
      porTipo.set(o.tipo, t);
    }

    return {
      total: obrigs.length, atrasadas, proximas7dias: proximas, entregues,
      porTipo: [...porTipo.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.total - a.total),
      timeline,
    };
  }

  // ───────────────────────────────────────────────────────────
  // 3. PRODUTIVIDADE DA EQUIPE
  //    Agrupa por responsável: clientes, docs, erros pescados.
  //    Real assim que os clientes têm responsável atribuído.
  // ───────────────────────────────────────────────────────────
  async produtividade() {
    const companies = await this.prisma.company.findMany({
      select: { id: true, responsavel: true, sharepointDocsCount: true, active: true },
    });
    const docsPorCo = new Map<string, number>();
    const grouped = await this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } });
    for (const g of grouped) docsPorCo.set(g.companyId, g._count._all);

    // erros por empresa
    const docsErro = await this.prisma.document.findMany({
      where: { fiscalValidation: { not: null } },
      select: { companyId: true, fiscalValidation: true },
    });
    const errosPorCo = new Map<string, number>();
    for (const d of docsErro) {
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) errosPorCo.set(d.companyId, (errosPorCo.get(d.companyId) ?? 0) + inc.length);
    }

    const porResp = new Map<string, { responsavel: string; clientes: number; clientesAtivos: number; docs: number; erros: number }>();
    for (const c of companies) {
      const key = c.responsavel || '— Sem responsável —';
      const cur = porResp.get(key) ?? { responsavel: key, clientes: 0, clientesAtivos: 0, docs: 0, erros: 0 };
      cur.clientes++;
      if (c.active) cur.clientesAtivos++;
      cur.docs += docsPorCo.get(c.id) ?? 0;
      cur.erros += errosPorCo.get(c.id) ?? 0;
      porResp.set(key, cur);
    }

    const equipe = [...porResp.values()].sort((a, b) => b.docs - a.docs).map((e) => ({
      ...e,
      docsPorCliente: e.clientesAtivos ? Math.round(e.docs / e.clientesAtivos) : 0,
      taxaErro: e.docs ? Math.round((e.erros / e.docs) * 10000) / 100 : 0, // % de erro
    }));
    const real = equipe.filter((e) => !e.responsavel.includes('Sem responsável'));
    const semResponsavel = equipe.find((e) => e.responsavel.includes('Sem responsável'))?.clientes ?? 0;

    // insights de gestão
    const insights: { tipo: string; texto: string }[] = [];
    if (real.length >= 2) {
      const cargas = real.map((e) => e.clientesAtivos);
      const maxC = Math.max(...cargas), minC = Math.min(...cargas);
      if (maxC - minC >= 15) {
        const sobre = real.find((e) => e.clientesAtivos === maxC)!;
        const sub = real.find((e) => e.clientesAtivos === minC)!;
        insights.push({ tipo: 'carga', texto: `Carga desbalanceada: ${sobre.responsavel} tem ${maxC} clientes ativos e ${sub.responsavel} tem ${minC}. Considere rebalancear.` });
      }
      const piorErro = [...real].sort((a, b) => b.taxaErro - a.taxaErro)[0];
      if (piorErro && piorErro.taxaErro > 0) {
        insights.push({ tipo: 'qualidade', texto: `Maior taxa de erro: ${piorErro.responsavel} (${piorErro.taxaErro}%). Pode indicar carteira mais complexa ou necessidade de apoio.` });
      }
    }

    return {
      analistas: real.length,
      semResponsavel,
      precisaAtribuir: semResponsavel > 0,
      totalDocs: equipe.reduce((s, e) => s + e.docs, 0),
      totalErros: equipe.reduce((s, e) => s + e.erros, 0),
      insights,
      equipe,
    };
  }

  /**
   * CARTEIRA DOS ANALISTAS — visão gerencial rica por analista:
   * clientes, docs, performance (taxa de erro), e as OBRIGAÇÕES da carteira dele
   * (entregues/pendentes/vencidas), além de clientes com pendência documental.
   */
  async carteiraAnalistas() {
    const now = new Date();
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true, responsavel: true, taxRegime: true, sharepointDocsCount: true },
    });
    const respPorCo = new Map(companies.map((c) => [c.id, c.responsavel || '— Sem responsável —']));
    const ids = companies.map((c) => c.id);

    // docs e erros por empresa
    const grouped = await this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } });
    const docsPorCo = new Map(grouped.map((g) => [g.companyId, g._count._all]));
    const docsErro = await this.prisma.document.findMany({
      where: { companyId: { in: ids }, fiscalValidation: { not: null } },
      select: { companyId: true, fiscalValidation: true },
    });
    const errosPorCo = new Map<string, number>();
    const temErroCo = new Set<string>();
    for (const d of docsErro) {
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) { errosPorCo.set(d.companyId, (errosPorCo.get(d.companyId) ?? 0) + inc.length); temErroCo.add(d.companyId); }
    }

    // obrigações da competência corrente + as vencidas em aberto
    const comp = now.toISOString().slice(0, 7);
    const obrig = await this.prisma.fiscalCalendarItem.findMany({
      where: { companyId: { in: ids } },
      select: { companyId: true, status: true, dataVencimento: true, competencia: true, tipo: true },
    });

    type Acc = {
      responsavel: string; clientes: number; docs: number; erros: number; clientesComErro: number;
      obrigTotal: number; obrigEntregues: number; obrigPendentes: number; obrigVencidas: number;
      clientesSemDoc: number; proximas7: number;
    };
    const map = new Map<string, Acc>();
    const get = (r: string) => {
      let a = map.get(r);
      if (!a) { a = { responsavel: r, clientes: 0, docs: 0, erros: 0, clientesComErro: 0, obrigTotal: 0, obrigEntregues: 0, obrigPendentes: 0, obrigVencidas: 0, clientesSemDoc: 0, proximas7: 0 }; map.set(r, a); }
      return a;
    };

    for (const c of companies) {
      const a = get(respPorCo.get(c.id)!);
      a.clientes++;
      const d = docsPorCo.get(c.id) ?? 0;
      a.docs += d;
      a.erros += errosPorCo.get(c.id) ?? 0;
      if (temErroCo.has(c.id)) a.clientesComErro++;
      if (d === 0) a.clientesSemDoc++;
    }

    const em7 = new Date(now.getTime() + 7 * 86400000);
    for (const o of obrig) {
      const r = respPorCo.get(o.companyId);
      if (!r) continue;
      const a = get(r);
      const entregue = o.status === 'paga' || o.status === 'isenta';
      const venc = new Date(o.dataVencimento);
      // considera só a competência corrente + qualquer coisa vencida em aberto (não engorda com histórico pago)
      const relevante = o.competencia === comp || (!entregue && venc < now);
      if (!relevante) continue;
      a.obrigTotal++;
      if (entregue) a.obrigEntregues++;
      else {
        a.obrigPendentes++;
        if (venc < now) a.obrigVencidas++;
        else if (venc <= em7) a.proximas7++;
      }
    }

    const analistas = [...map.values()]
      .filter((a) => !a.responsavel.includes('Sem responsável'))
      .map((a) => {
        // clientes que precisam de atenção: com erro fiscal ou sem documento (limitado ao total)
        const clientesAtencao = Math.min(a.clientes, a.clientesComErro + a.clientesSemDoc);
        return {
          ...a,
          taxaErro: a.docs ? Math.round((a.erros / a.docs) * 10000) / 100 : 0,
          // ENTREGAS: % de obrigações entregues
          pctEntrega: a.obrigTotal ? Math.round((a.obrigEntregues / a.obrigTotal) * 100) : 100,
          // TEMPO/PONTUALIDADE: % das obrigações NÃO vencidas (no prazo)
          pontualidade: a.obrigTotal ? Math.round(((a.obrigTotal - a.obrigVencidas) / a.obrigTotal) * 100) : 100,
          // PRECISÃO: % de clientes SEM erro fiscal
          precisao: a.clientes ? Math.round(((a.clientes - a.clientesComErro) / a.clientes) * 100) : 100,
          clientesAtencao,
        };
      })
      .sort((a, b) => b.obrigVencidas - a.obrigVencidas || b.clientesAtencao - a.clientesAtencao || b.clientes - a.clientes);

    const semResp = map.get('— Sem responsável —');
    return {
      competencia: comp,
      analistas,
      totais: {
        clientes: analistas.reduce((s, a) => s + a.clientes, 0),
        obrigPendentes: analistas.reduce((s, a) => s + a.obrigPendentes, 0),
        obrigVencidas: analistas.reduce((s, a) => s + a.obrigVencidas, 0),
        proximas7: analistas.reduce((s, a) => s + a.proximas7, 0),
        clientesSemResponsavel: semResp?.clientes ?? 0,
      },
    };
  }

  /**
   * PANORAMA AO VIVO — o pulso da operação para o gestor, num payload só e barato:
   * o que está entrando agora, o que vence, o que precisa de ação — com um FEED de
   * insights priorizados e acionáveis (cada um com rota). Feito para auto-refresh.
   */
  async panorama() {
    const now = new Date();
    const hoje0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const em7 = new Date(now.getTime() + 7 * 86400000);
    const nowComp = now.toISOString().slice(0, 7);

    const [companies, docsHoje, docs2026, ult, obrigMes, docsMes] = await Promise.all([
      this.prisma.company.findMany({ where: { active: true }, select: { id: true, responsavel: true, cnpj: true } }),
      this.prisma.document.count({ where: { createdAt: { gte: hoje0 } } }),
      this.prisma.document.count({ where: { issueDate: { gte: new Date(2026, 0, 1) } } }),
      this.prisma.company.aggregate({ where: { active: true }, _max: { sharepointAnalisadoEm: true } }),
      this.prisma.fiscalCalendarItem.findMany({ where: { dataVencimento: { gte: inicioMes, lte: fimMes } }, select: { status: true, dataVencimento: true } }),
      this.prisma.document.findMany({ where: { issueDate: { gte: inicioMes } }, select: { companyId: true } }),
    ]);

    const totalClientes = companies.length;
    const semResponsavel = companies.filter((c) => !c.responsavel).length;
    const cnpjProvisorio = companies.filter((c) => (c.cnpj ?? '').replace(/\D/g, '').startsWith('7')).length;
    const comDocMes = new Set(docsMes.map((d) => d.companyId));
    const semDocMes = companies.filter((c) => !comDocMes.has(c.id)).length;

    const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
    let obrigTotal = 0, obrigVencidas = 0, obrigVencem7 = 0, obrigEntregues = 0;
    for (const o of obrigMes) {
      obrigTotal++;
      const v = new Date(o.dataVencimento);
      if (ENTREGUE.has(o.status)) { obrigEntregues++; continue; }
      if (o.status === 'vencida' || v < now) obrigVencidas++;
      else if (v <= em7) obrigVencem7++;
    }
    const pctEntrega = obrigTotal ? Math.round((obrigEntregues / obrigTotal) * 100) : 0;

    const driveLidoEm = ult._max.sharepointAnalisadoEm ?? null;
    const minAtras = driveLidoEm ? Math.round((now.getTime() - new Date(driveLidoEm).getTime()) / 60000) : null;

    // ── FEED DE INSIGHTS (priorizado, acionável) ──
    const insights: { nivel: 'critico' | 'alerta' | 'oportunidade' | 'ok'; titulo: string; texto: string; rota: string }[] = [];
    if (obrigVencidas > 0) insights.push({ nivel: 'critico', titulo: `${obrigVencidas} obrigação(ões) vencida(s)`, texto: 'Prazos do mês já vencidos — priorizar a entrega hoje.', rota: '/prazos' });
    if (obrigVencem7 > 0) insights.push({ nivel: 'alerta', titulo: `${obrigVencem7} vencem em 7 dias`, texto: 'Obrigações da competência com prazo próximo.', rota: '/prazos' });
    if (obrigTotal === 0) insights.push({ nivel: 'alerta', titulo: 'Calendário fiscal vazio', texto: `Nenhuma obrigação gerada para ${nowComp}. Configure em Saúde da Implantação.`, rota: '/implantacao' });
    if (semDocMes > 0) insights.push({ nivel: 'alerta', titulo: `${semDocMes} clientes sem documentos no mês`, texto: 'Não enviaram/capturamos notas deste mês — cobrar ou puxar do SEFAZ.', rota: '/solicitacoes' });
    if (semResponsavel > 0) insights.push({ nivel: 'alerta', titulo: `${semResponsavel} clientes sem responsável`, texto: 'Atribua para destravar o Meu Dia e a carteira dos analistas.', rota: '/implantacao' });
    if (cnpjProvisorio > 0) insights.push({ nivel: 'alerta', titulo: `${cnpjProvisorio} CNPJs provisórios`, texto: 'Sem CNPJ real não há SEFAZ, situação fiscal nem NFS-e nacional.', rota: '/carteira' });
    if (docs2026 > 0) insights.push({ nivel: 'oportunidade', titulo: `${docs2026.toLocaleString('pt-BR')} documentos de 2026 no acervo`, texto: 'Rode a base legal para converter em análise (monofásico, inconsistências).', rota: '/oportunidade-monofasica' });
    if (docs2026 === 0) insights.push({ nivel: 'critico', titulo: 'Nenhum documento de 2026', texto: 'Sincronize o drive (Delta) ou puxe do SEFAZ/SIEG.', rota: '/drive-conectado' });
    if (!insights.some((i) => i.nivel === 'critico')) insights.push({ nivel: 'ok', titulo: 'Operação sob controle', texto: 'Sem alertas críticos no momento.', rota: '/operacao' });

    return {
      atualizadoEm: now.toISOString(),
      pulso: {
        docsHoje, docs2026, driveLidoEm, driveLidoHaMin: minAtras,
        totalClientes,
      },
      kpis: {
        obrigVencidas, obrigVencem7, obrigEntregues, obrigTotal, pctEntrega,
        semDocMes, semResponsavel, cnpjProvisorio,
      },
      insights: insights.slice(0, 8),
    };
  }

  /**
   * TENDÊNCIAS (12 meses) — a série histórica que o gestor usa para analisar se está
   * MELHORANDO ou piorando: documentos, movimento (R$), % de entrega e % de erro por mês.
   */
  async tendencias() {
    const desde = new Date(); desde.setMonth(desde.getMonth() - 13);
    const [docs, obrig] = await Promise.all([
      this.prisma.document.findMany({ where: { issueDate: { gte: desde } }, select: { issueDate: true, totalValue: true, fiscalValidation: true } }),
      this.prisma.fiscalCalendarItem.findMany({ select: { competencia: true, status: true } }),
    ]);
    type M = { documentos: number; movimento: number; notasErro: number; obrigTotal: number; obrigEntregues: number };
    const meses = new Map<string, M>();
    const get = (m: string): M => { let x = meses.get(m); if (!x) { x = { documentos: 0, movimento: 0, notasErro: 0, obrigTotal: 0, obrigEntregues: 0 }; meses.set(m, x); } return x; };
    for (const d of docs) {
      if (!d.issueDate) continue;
      const m = new Date(d.issueDate).toISOString().slice(0, 7);
      const x = get(m); x.documentos++; x.movimento += d.totalValue ?? 0;
      if ((safe(d.fiscalValidation)?.inconsistencias ?? []).length) x.notasErro++;
    }
    const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
    for (const o of obrig) {
      const m = (o.competencia || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) continue;
      const x = get(m); x.obrigTotal++; if (ENTREGUE.has(o.status)) x.obrigEntregues++;
    }
    const linha = [...meses.keys()].sort().slice(-12).map((m) => {
      const x = meses.get(m)!;
      return {
        mes: m, documentos: x.documentos, movimento: r2(x.movimento),
        pctEntrega: x.obrigTotal ? Math.round((x.obrigEntregues / x.obrigTotal) * 100) : 0,
        pctErro: x.documentos ? Math.round((x.notasErro / x.documentos) * 100) : 0,
      };
    });
    // resumo: variação do último mês fechado vs anterior
    const n = linha.length;
    const delta = (campo: 'pctEntrega' | 'pctErro' | 'documentos') => n >= 2 ? (linha[n - 1] as any)[campo] - (linha[n - 2] as any)[campo] : 0;
    return { linha, variacao: { entrega: delta('pctEntrega'), erro: delta('pctErro'), documentos: delta('documentos') } };
  }

  /**
   * ENTREGAS POR MÊS — documentos capturados por mês de emissão + obrigações entregues
   * por competência. Responde "quantos docs de 2026?" e "entregas por mês" numa tela.
   */
  async entregasMensais() {
    const [docs, obrig] = await Promise.all([
      this.prisma.document.findMany({ where: { issueDate: { not: null } }, select: { issueDate: true } }),
      this.prisma.fiscalCalendarItem.findMany({ select: { competencia: true, status: true } }),
    ]);
    const docsPorMes = new Map<string, number>();
    let docs2026 = 0, semData = 0;
    for (const d of docs) {
      if (!d.issueDate) { semData++; continue; }
      const m = new Date(d.issueDate).toISOString().slice(0, 7);
      docsPorMes.set(m, (docsPorMes.get(m) ?? 0) + 1);
      if (m >= '2026-01') docs2026++;
    }
    const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
    const obrigPorMes = new Map<string, { total: number; entregues: number }>();
    for (const o of obrig) {
      const comp = (o.competencia || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(comp)) continue;
      const b = obrigPorMes.get(comp) ?? { total: 0, entregues: 0 };
      b.total++; if (ENTREGUE.has(o.status)) b.entregues++;
      obrigPorMes.set(comp, b);
    }
    const meses = [...new Set([...docsPorMes.keys(), ...obrigPorMes.keys()])].sort().slice(-18);
    return {
      totalDocs: docs.length, docs2026, semData,
      totalDocsComData: docs.length,
      linha: meses.map((m) => ({
        mes: m,
        documentos: docsPorMes.get(m) ?? 0,
        obrigacoes: obrigPorMes.get(m)?.total ?? 0,
        entregues: obrigPorMes.get(m)?.entregues ?? 0,
        pctEntrega: obrigPorMes.get(m)?.total ? Math.round((obrigPorMes.get(m)!.entregues / obrigPorMes.get(m)!.total) * 100) : 0,
      })),
    };
  }

  /**
   * PAINEL DO ANALISTA — o gerente abre e vê TODA a carteira de um analista:
   * cada cliente com urgência, pendências, inconsistências (com o que são) e o
   * FRESCOR DO DRIVE (quando os docs foram lidos pela última vez). Se `responsavel`
   * vier vazio, devolve a lista de analistas para escolher.
   */
  async painelAnalista(responsavel?: string) {
    const analistas = await this.responsaveis();
    if (!responsavel) return { escolher: true, analistas: analistas.nomes ?? [] };

    const now = new Date();
    const comp = now.toISOString().slice(0, 7);
    const companies = await this.prisma.company.findMany({
      where: { active: true, responsavel },
      select: { id: true, name: true, taxRegime: true, sharepointItemId: true, sharepointAnalisadoEm: true, sharepointDocsCount: true },
    });
    const ids = companies.map((c) => c.id);

    // docs + inconsistências (com os textos, pra explicar o que é)
    const docs = await this.prisma.document.findMany({
      where: { companyId: { in: ids }, extractedData: { not: null } },
      select: { companyId: true, extractedData: true, fiscalValidation: true },
    });
    type Ag = { docs: number; entradas: number; inc: number; incTextos: string[] };
    const ag = new Map<string, Ag>();
    for (const d of docs) {
      const a = ag.get(d.companyId) ?? { docs: 0, entradas: 0, inc: 0, incTextos: [] };
      a.docs++;
      const nf = safe(d.extractedData);
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      if (['1', '2', '3'].includes(dir)) a.entradas++;
      const inc: string[] = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) { a.inc += inc.length; for (const t of inc) if (a.incTextos.length < 4) a.incTextos.push(t); }
      ag.set(d.companyId, a);
    }

    // obrigações por cliente (competência corrente + vencidas em aberto)
    const obrig = await this.prisma.fiscalCalendarItem.findMany({
      where: { companyId: { in: ids } },
      select: { companyId: true, status: true, dataVencimento: true, competencia: true, tipo: true, descricao: true },
    });
    type Ob = { pendentes: number; vencidas: number; proximas7: number; itensUrgentes: { tipo: string; venc: string }[] };
    const obBy = new Map<string, Ob>();
    const em7 = new Date(now.getTime() + 7 * 86400000);
    for (const o of obrig) {
      const entregue = o.status === 'paga' || o.status === 'isenta';
      const venc = new Date(o.dataVencimento);
      const relevante = o.competencia === comp || (!entregue && venc < now);
      if (!relevante || entregue) continue;
      const b = obBy.get(o.companyId) ?? { pendentes: 0, vencidas: 0, proximas7: 0, itensUrgentes: [] };
      b.pendentes++;
      if (venc < now) { b.vencidas++; if (b.itensUrgentes.length < 3) b.itensUrgentes.push({ tipo: o.tipo, venc: venc.toISOString().slice(0, 10) }); }
      else if (venc <= em7) { b.proximas7++; if (b.itensUrgentes.length < 3) b.itensUrgentes.push({ tipo: o.tipo, venc: venc.toISOString().slice(0, 10) }); }
      obBy.set(o.companyId, b);
    }

    // frescor do drive: quando cada cliente foi lido por último
    const DIAS_STALE = 2;
    const staleCut = new Date(now.getTime() - DIAS_STALE * 86400000);
    let driveOk = 0, driveStale = 0, driveNunca = 0, semPasta = 0;

    const clientes = companies.map((c) => {
      const a = ag.get(c.id) ?? { docs: 0, entradas: 0, inc: 0, incTextos: [] };
      const b = obBy.get(c.id) ?? { pendentes: 0, vencidas: 0, proximas7: 0, itensUrgentes: [] };
      // frescor do drive
      let drive: 'ok' | 'desatualizado' | 'nunca' | 'sem_pasta';
      if (!c.sharepointItemId) { drive = 'sem_pasta'; semPasta++; }
      else if (!c.sharepointAnalisadoEm) { drive = 'nunca'; driveNunca++; }
      else if (new Date(c.sharepointAnalisadoEm) < staleCut) { drive = 'desatualizado'; driveStale++; }
      else { drive = 'ok'; driveOk++; }

      const pend: string[] = [];
      if (a.docs === 0) pend.push('sem documentos no mês');
      else if (a.entradas === 0) pend.push('sem notas de entrada');
      if (b.pendentes > 0) pend.push(`${b.pendentes} obrigação(ões) a entregar`);
      if (a.inc > 0) pend.push(`${a.inc} inconsistência(s) fiscais`);

      // urgência: obrigação vencida > vence em 7d > muita inconsistência > sem docs
      let urgencia: 'critica' | 'alta' | 'media' | 'ok';
      if (b.vencidas > 0) urgencia = 'critica';
      else if (b.proximas7 > 0 || a.inc >= 5) urgencia = 'alta';
      else if (a.inc > 0 || a.docs === 0) urgencia = 'media';
      else urgencia = 'ok';

      return {
        companyId: c.id, cliente: c.name, regime: c.taxRegime,
        docs: a.docs, inconsistencias: a.inc, incExemplos: a.incTextos,
        obrigPendentes: b.pendentes, obrigVencidas: b.vencidas, obrigProximas7: b.proximas7, obrigItens: b.itensUrgentes,
        drive, driveLidoEm: c.sharepointAnalisadoEm ?? null,
        pendencias: pend, urgencia,
      };
    }).sort((x, y) => ({ critica: 0, alta: 1, media: 2, ok: 3 } as any)[x.urgencia] - ({ critica: 0, alta: 1, media: 2, ok: 3 } as any)[y.urgencia]
      || y.obrigVencidas - x.obrigVencidas || y.inconsistencias - x.inconsistencias);

    return {
      responsavel, competencia: comp, analistas: analistas.nomes ?? [],
      resumo: {
        clientes: companies.length,
        criticos: clientes.filter((c) => c.urgencia === 'critica').length,
        altos: clientes.filter((c) => c.urgencia === 'alta').length,
        obrigVencidas: clientes.reduce((s, c) => s + c.obrigVencidas, 0),
        obrigPendentes: clientes.reduce((s, c) => s + c.obrigPendentes, 0),
        comInconsistencia: clientes.filter((c) => c.inconsistencias > 0).length,
      },
      drive: { ok: driveOk, desatualizado: driveStale, nunca: driveNunca, semPasta, diasStale: DIAS_STALE },
      clientes,
    };
  }

  // ───────────────────────────────────────────────────────────
  // ATRIBUIÇÃO cliente → responsável (destrava Meu Dia e Produtividade)
  // ───────────────────────────────────────────────────────────
  /**
   * SAÚDE DA IMPLANTAÇÃO — o "roteiro da 1ª hora" do gestor. Cada item é um
   * problema de fundação com contagem e ação em massa. Some quando resolvido.
   */
  async saudeImplantacao() {
    const now = new Date();
    const ano = now.getFullYear();
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, cnpj: true, responsavel: true, sharepointItemId: true, sharepointAnalisadoEm: true },
    });
    const total = companies.length;
    const semCnpj = companies.filter((c) => (c.cnpj ?? '').replace(/\D/g, '').startsWith('7')).length;
    const semResponsavel = companies.filter((c) => !c.responsavel).length;
    const semPasta = companies.filter((c) => !c.sharepointItemId).length;

    // calendário do ano corrente já gerado?
    const idsComCalendario = new Set(
      (await this.prisma.fiscalCalendarItem.findMany({
        where: { competencia: { startsWith: String(ano) } },
        select: { companyId: true }, distinct: ['companyId'],
      })).map((x) => x.companyId),
    );
    const semCalendario = companies.filter((c) => !idsComCalendario.has(c.id)).length;

    // frescor do drive
    const staleCut = new Date(now.getTime() - 2 * 86400000);
    let driveOk = 0, driveStale = 0, driveNunca = 0;
    for (const c of companies) {
      if (!c.sharepointItemId) continue;
      if (!c.sharepointAnalisadoEm) driveNunca++;
      else if (new Date(c.sharepointAnalisadoEm) < staleCut) driveStale++;
      else driveOk++;
    }

    // 2026: há documentos com emissão neste ano? (entrada de docs reativada?)
    const docs2026 = await this.prisma.document.count({
      where: { issueDate: { gte: new Date(ano, 0, 1) } },
    });

    // itens do roteiro, em ordem de impacto; `ok:true` = resolvido (some da lista)
    const itens = [
      { chave: 'calendario', ok: semCalendario === 0, titulo: 'Regerar o calendário fiscal', qtd: semCalendario,
        texto: `${semCalendario} clientes sem calendário ${ano}. Regera com as datas novas (FGTS dia 20, DCTFWeb último dia útil).`,
        acao: 'regerar-calendario', rota: null },
      { chave: 'responsavel', ok: semResponsavel === 0, titulo: 'Atribuir responsáveis', qtd: semResponsavel,
        texto: `${semResponsavel} clientes sem analista. Distribui automaticamente entre a equipe (destrava Meu Dia e a torre de controle).`,
        acao: 'auto-atribuir', rota: '/atribuir-responsavel' },
      { chave: 'cnpj', ok: semCnpj === 0, titulo: 'Completar CNPJs', qtd: semCnpj,
        texto: `${semCnpj} clientes com CNPJ provisório (começam com 7). Sem CNPJ real não há consulta de situação fiscal nem NFS-e nacional.`,
        acao: null, rota: '/carteira' },
      { chave: 'entrada2026', ok: docs2026 > 0, titulo: 'Reativar a entrada de documentos', qtd: docs2026 === 0 ? total : 0,
        texto: docs2026 > 0 ? `${docs2026} documentos de ${ano} já capturados.` : `Nenhum documento de ${ano} no drive. Os clientes não estão enviando (ou não estão sendo arquivados). Cobre os clientes ou avalie captura direta na SEFAZ.`,
        acao: null, rota: '/solicitacoes' },
      { chave: 'drive', ok: driveStale + driveNunca === 0, titulo: 'Leitura do drive em dia', qtd: driveStale + driveNunca,
        texto: `${driveOk} clientes atualizados · ${driveStale} desatualizados · ${driveNunca} nunca lidos. A varredura roda a cada 15 min.`,
        acao: 'sincronizar', rota: null },
    ];
    const pendentes = itens.filter((i) => !i.ok);
    const pct = itens.length ? Math.round(((itens.length - pendentes.length) / itens.length) * 100) : 100;

    return {
      total, ano,
      completo: pendentes.length === 0,
      pctSaude: pct,
      resumo: { semCnpj, semResponsavel, semCalendario, semPasta, docs2026, drive: { ok: driveOk, desatualizado: driveStale, nunca: driveNunca } },
      itens,
    };
  }

  async responsaveis() {
    const [companies, users] = await Promise.all([
      this.prisma.company.findMany({ select: { responsavel: true } }),
      this.prisma.user.findMany({ where: { active: true }, select: { name: true } }),
    ]);
    const nomes = new Set<string>();
    for (const c of companies) if (c.responsavel) nomes.add(c.responsavel);
    for (const u of users) if (u.name) nomes.add(u.name);
    return {
      nomes: [...nomes].sort((a, b) => a.localeCompare(b)),
      total: companies.length,
      naoAtribuidos: companies.filter((c) => !c.responsavel).length,
    };
  }

  async listarClientes(q?: string, sem?: boolean) {
    const where: any = {};
    if (q) where.name = { contains: q, mode: 'insensitive' };
    if (sem) where.responsavel = null;
    return this.prisma.company.findMany({
      where,
      select: { id: true, name: true, responsavel: true, active: true, taxRegime: true, sharepointDocsCount: true },
      orderBy: { name: 'asc' }, take: 800,
    });
  }

  async atribuir(companyIds: string[], responsavel: string) {
    const r = (responsavel || '').trim();
    if (!companyIds?.length) return { atualizados: 0 };
    await this.prisma.company.updateMany({
      where: { id: { in: companyIds } },
      data: { responsavel: r || null },
    });
    return { atualizados: companyIds.length, responsavel: r || null };
  }

  /** Distribui automaticamente (round-robin) os clientes sem responsável. */
  async distribuir(nomes: string[]) {
    const limpos = [...new Set((nomes ?? []).map((n) => n.trim()).filter(Boolean))];
    if (!limpos.length) return { distribuidos: 0, erro: 'Informe ao menos um responsável.' };
    const semResp = await this.prisma.company.findMany({
      where: { responsavel: null }, select: { id: true }, orderBy: { name: 'asc' },
    });
    const buckets = new Map<string, string[]>();
    semResp.forEach((c, idx) => {
      const n = limpos[idx % limpos.length];
      if (!buckets.has(n)) buckets.set(n, []);
      buckets.get(n)!.push(c.id);
    });
    for (const [n, ids] of buckets) {
      await this.prisma.company.updateMany({ where: { id: { in: ids } }, data: { responsavel: n } });
    }
    return {
      distribuidos: semResp.length,
      entre: limpos,
      porResponsavel: [...buckets.entries()].map(([nome, ids]) => ({ nome, clientes: ids.length })),
    };
  }

  // ───────────────────────────────────────────────────────────
  // 4. MEU DIA — central de trabalho acionável
  //    O que precisa de ação agora: erros a corrigir, obrigações
  //    a vencer, XMLs recentes. Filtra por responsável quando há.
  // ───────────────────────────────────────────────────────────
  async meuDia(responsavel?: string) {
    const now = new Date();
    const em7 = new Date(now.getTime() + 7 * 864e5);
    const companies = await this.prisma.company.findMany({
      where: responsavel ? { responsavel } : {},
      select: { id: true, name: true, responsavel: true },
    });
    const coIds = new Set(companies.map((c) => c.id));
    const coById = new Map(companies.map((c) => [c.id, c]));

    // obrigações vencidas + próximas — mesma fonte do calendário (fiscal_calendar_items)
    const obrigsRaw = await this.prisma.fiscalCalendarItem.findMany({
      where: {
        dataVencimento: { lte: em7 },
        status: { notIn: ['paga', 'isenta', 'entregue'] },
        ...(responsavel ? { companyId: { in: [...coIds] } } : {}),
      },
      select: { companyId: true, descricao: true, tipo: true, dataVencimento: true },
      orderBy: { dataVencimento: 'asc' }, take: 100,
    });
    const obrigs = obrigsRaw.map((o) => ({ companyId: o.companyId, name: o.descricao || o.tipo, type: o.tipo, dueDate: o.dataVencimento }));

    // inconsistências a corrigir
    const docs = await this.prisma.document.findMany({
      where: { fiscalValidation: { not: null }, ...(responsavel ? { companyId: { in: [...coIds] } } : {}) },
      select: { companyId: true, number: true, totalValue: true, fiscalValidation: true },
    });
    let notasComErro = 0;
    const errosPorCliente = new Map<string, number>();
    for (const d of docs) {
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) { notasComErro++; errosPorCliente.set(d.companyId, (errosPorCliente.get(d.companyId) ?? 0) + 1); }
    }

    // CLIENTES SEM DOCUMENTOS NO MÊS — o analista precisa cobrar/verificar quem não enviou.
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const docsMes = await this.prisma.document.findMany({
      where: { issueDate: { gte: inicioMes }, ...(responsavel ? { companyId: { in: [...coIds] } } : {}) },
      select: { companyId: true },
    });
    const comDocMes = new Set(docsMes.map((d) => d.companyId));
    const semDocMes = companies.filter((c) => !comDocMes.has(c.id));

    const vencidas = obrigs.filter((o) => new Date(o.dueDate) < now);
    const proximas = obrigs.filter((o) => new Date(o.dueDate) >= now);

    const aFazer = [
      ...vencidas.map((o) => ({ prioridade: 'alta', tipo: 'obrigacao', titulo: `${o.name} VENCIDA`, cliente: coById.get(o.companyId)?.name, companyId: o.companyId, data: o.dueDate })),
      ...[...errosPorCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([cid, n]) => ({ prioridade: 'alta', tipo: 'inconsistencia', titulo: `${n} nota(s) com erro fiscal — ${coById.get(cid)?.name ?? ''}`, cliente: coById.get(cid)?.name, companyId: cid, data: null })),
      ...semDocMes.slice(0, 20).map((c) => ({ prioridade: 'alta', tipo: 'sem_documento', titulo: 'Sem documentos neste mês — cobrar o cliente', cliente: c.name, companyId: c.id, data: null })),
      ...proximas.map((o) => ({ prioridade: 'media', tipo: 'obrigacao', titulo: o.name, cliente: coById.get(o.companyId)?.name, companyId: o.companyId, data: o.dueDate })),
    ];

    return {
      responsavel: responsavel ?? null,
      resumo: {
        obrigacoesVencidas: vencidas.length,
        obrigacoesProximas: proximas.length,
        notasComErro,
        clientesComErro: errosPorCliente.size,
        clientesSemDoc: semDocMes.length,
        clientes: companies.length,
      },
      aFazer: aFazer.slice(0, 80),
    };
  }
}
