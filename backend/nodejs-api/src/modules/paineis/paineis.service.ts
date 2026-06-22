import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

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
      const ult = await this.prisma.fluxoEstado.findFirst({
        where: { departamento: 'fiscal', reciboCheckedAt: { not: null } },
        orderBy: { competencia: 'desc' }, select: { competencia: true },
      });
      comp = ult?.competencia ?? new Date().toISOString().slice(0, 7);
    }
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, taxRegime: true, responsavel: true },
    });
    const ids = companies.map((c) => c.id);
    const [docs, fluxos] = await Promise.all([
      this.prisma.document.findMany({ where: { companyId: { in: ids }, extractedData: { not: null } }, select: { companyId: true, totalValue: true, extractedData: true, fiscalValidation: true } }),
      this.prisma.fluxoEstado.findMany({ where: { departamento: 'fiscal', competencia: comp, companyId: { in: ids }, reciboCheckedAt: { not: null } }, select: { companyId: true, reciboEncontrado: true } }),
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
      const pend: string[] = [];
      const declPendente = mesProcessado && !entregue; // só conta se o mês já foi verificado
      if (a.docs === 0) pend.push('sem documentos');
      if (a.docs > 0 && a.entradas === 0) pend.push('sem entradas');
      if (a.inc > 0) pend.push(`${a.inc} inconsistência(s)`);
      if (!REGIMES.has(c.taxRegime ?? '')) pend.push('sem regime');
      if (declPendente) pend.push('declaração não entregue');
      if (a.docs === 0 || a.inc >= 5) status = 'vermelho';
      else if (a.entradas === 0 || a.inc > 0 || declPendente) status = 'amarelo';
      else status = 'verde';
      if (status === 'verde') verdes++; else if (status === 'amarelo') amarelos++; else vermelhos++;
      return { companyId: c.id, cliente: c.name, regime: c.taxRegime, responsavel: c.responsavel, docs: a.docs, inconsistencias: a.inc, valorInc: Math.round(a.valorInc * 100) / 100, declaracaoEntregue: entregue, status, pendencias: pend };
    }).sort((x, y) => ({ vermelho: 0, amarelo: 1, verde: 2 } as any)[x.status] - ({ vermelho: 0, amarelo: 1, verde: 2 } as any)[y.status] || y.inconsistencias - x.inconsistencias);

    return {
      competencia: comp,
      mesProcessado,
      totalClientes: companies.length,
      semaforo: { verdes, amarelos, vermelhos },
      documentos: { total: totDocs, clientesComDocs: comDocs, clientesSemDocs: semDocs },
      declaracoes: { entregues: declEntregue, pendentes: companies.length - declEntregue },
      pendencias: { clientes: amarelos + vermelhos, semDocumentos: semDocs, semEntradas },
      inconsistencias: { notas: totInc, valor: Math.round(valorInc * 100) / 100, clientes: clientesInc },
      clientes,
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

    const obrigs = await this.prisma.fiscalObligation.findMany({
      where: { dueDate: { gte: ini, lte: fim }, ...(responsavel ? { responsavel } : {}) },
      select: { companyId: true, name: true, type: true, dueDate: true, status: true, responsavel: true },
    });

    const isAtrasada = (o: any) => o.status !== 'transmitted' && o.status !== 'delivered' && new Date(o.dueDate) < now;

    // agrupa por dia + tipo
    const porData = new Map<string, { data: string; tipos: Map<string, { total: number; atrasadas: number }> }>();
    let atrasadas = 0, proximas = 0, entregues = 0;
    for (const o of obrigs) {
      const dia = new Date(o.dueDate).toISOString().slice(0, 10);
      if (!porData.has(dia)) porData.set(dia, { data: dia, tipos: new Map() });
      const bucket = porData.get(dia)!;
      const t = bucket.tipos.get(o.type) ?? { total: 0, atrasadas: 0 };
      t.total++;
      if (isAtrasada(o)) { t.atrasadas++; atrasadas++; }
      bucket.tipos.set(o.type, t);
      const dd = new Date(o.dueDate);
      if (o.status === 'transmitted' || o.status === 'delivered') entregues++;
      else if (dd >= now && dd <= new Date(now.getTime() + 7 * 864e5)) proximas++;
    }

    const timeline = [...porData.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((d) => ({ data: d.data, tipos: [...d.tipos.entries()].map(([type, v]) => ({ type, ...v })) }));

    // resumo por tipo
    const porTipo = new Map<string, { total: number; atrasadas: number }>();
    for (const o of obrigs) {
      const t = porTipo.get(o.type) ?? { total: 0, atrasadas: 0 };
      t.total++; if (isAtrasada(o)) t.atrasadas++;
      porTipo.set(o.type, t);
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

  // ───────────────────────────────────────────────────────────
  // ATRIBUIÇÃO cliente → responsável (destrava Meu Dia e Produtividade)
  // ───────────────────────────────────────────────────────────
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

    // obrigações vencidas + próximas
    const obrigs = await this.prisma.fiscalObligation.findMany({
      where: {
        dueDate: { lte: em7 },
        status: { notIn: ['transmitted', 'delivered'] },
        ...(responsavel ? { companyId: { in: [...coIds] } } : {}),
      },
      select: { companyId: true, name: true, type: true, dueDate: true },
      orderBy: { dueDate: 'asc' }, take: 100,
    });

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

    const vencidas = obrigs.filter((o) => new Date(o.dueDate) < now);
    const proximas = obrigs.filter((o) => new Date(o.dueDate) >= now);

    const aFazer = [
      ...vencidas.map((o) => ({ prioridade: 'alta', tipo: 'obrigacao', titulo: `${o.name} VENCIDA`, cliente: coById.get(o.companyId)?.name, data: o.dueDate })),
      ...[...errosPorCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([cid, n]) => ({ prioridade: 'alta', tipo: 'inconsistencia', titulo: `${n} nota(s) com erro fiscal`, cliente: coById.get(cid)?.name, companyId: cid, data: null })),
      ...proximas.map((o) => ({ prioridade: 'media', tipo: 'obrigacao', titulo: o.name, cliente: coById.get(o.companyId)?.name, companyId: o.companyId, data: o.dueDate })),
    ];

    return {
      responsavel: responsavel ?? null,
      resumo: {
        obrigacoesVencidas: vencidas.length,
        obrigacoesProximas: proximas.length,
        notasComErro,
        clientesComErro: errosPorCliente.size,
        clientes: companies.length,
      },
      aFazer: aFazer.slice(0, 60),
    };
  }
}
