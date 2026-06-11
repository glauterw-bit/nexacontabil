import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

/** Traduz uma inconsistência fiscal em causa + passo a passo de correção. */
function comoCorrigir(erro: string) {
  const ncm = (erro.match(/NCM (\d+)/) || [])[1] ?? '';
  if (/ICMS interno .*padr[aã]o/i.test(erro)) {
    const m = erro.match(/interno ([\d.]+)%\s*\(padr[aã]o ([\d.]+)%/i);
    const aplicada = m?.[1] ?? '?', correta = m?.[2] ?? '?';
    const isento = correta === '0' || correta === '0.0';
    return {
      categoria: 'Alíquota de ICMS interna divergente',
      severidade: 'alta',
      causa: `A nota aplicou ICMS de ${aplicada}% numa operação interna, mas o padrão do NCM ${ncm} (Banco de NCM) é ${correta}%.`,
      passos: [
        `Abra o cadastro do produto (NCM ${ncm}) no Domínio e confira a tributação de ICMS.`,
        isento
          ? `O padrão é 0% — se for isento/cesta básica/Simples, ajuste o CST/CSOSN para isenção e zere o ICMS.`
          : `Ajuste a alíquota interna para ${correta}% (ou confirme se há redução de base/benefício que justifique ${aplicada}%).`,
        `Se a nota estiver correta e o padrão errado, corrija a regra no Banco de NCM (o cliente pode ter particularidade).`,
      ],
    };
  }
  if (/interestadual .*fora do legal/i.test(erro)) {
    const m = erro.match(/interestadual ([\d.]+)%/i);
    return {
      categoria: 'ICMS interestadual fora da alíquota legal',
      severidade: 'alta',
      causa: `Operação interestadual com ICMS de ${m?.[1] ?? '?'}%. A legislação só admite 4% (importados), 7% ou 12% conforme origem/destino.`,
      passos: [
        `Verifique a UF de origem e destino e aplique a alíquota legal (4% / 7% / 12%).`,
        `Cheque o CST/CSOSN e se a operação tem ST ou DIFAL.`,
        `Corrija o lançamento no Domínio para a alíquota correta.`,
      ],
    };
  }
  if (/sem regra/i.test(erro)) {
    return {
      categoria: 'NCM sem classificação',
      severidade: 'media',
      causa: `O NCM ${ncm} ainda não tem regra de tributação no Banco de NCM.`,
      passos: [`Classifique o NCM ${ncm} no Banco de NCM (alíquotas e CST por segmento) para que a validação passe a cobrir esse produto.`],
    };
  }
  return {
    categoria: 'Inconsistência fiscal',
    severidade: 'media',
    causa: erro,
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
