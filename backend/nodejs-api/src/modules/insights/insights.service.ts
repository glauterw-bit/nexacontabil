import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { calcularDasSimples } from './simples-nacional.util';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  constructor(private readonly prisma: PrismaService, private readonly ai: AiService) {}

  /** Agrega os dados reais do cliente a partir dos documentos analisados. */
  private async agregar(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxRegime: true, segmentoFiscal: true },
    });
    if (!company) return null;
    const docs = await this.prisma.document.findMany({
      where: { companyId, extractedData: { not: null } },
      select: { extractedData: true, fiscalValidation: true, totalValue: true, issueDate: true },
    });
    let faturamento = 0, icms = 0, ipi = 0, pis = 0, cofins = 0, st = 0, notasComSt = 0, inconsistencias = 0;
    let minDate: number | null = null, maxDate: number | null = null;
    const ncmTotais = new Map<string, { total: number; desc?: string }>();
    for (const d of docs) {
      const nf = safe(d.extractedData); if (!nf) continue;
      const t = nf.totais ?? {};
      faturamento += d.totalValue ?? t.produtos ?? 0;
      icms += t.icms ?? 0; ipi += t.ipi ?? 0; pis += t.pis ?? 0; cofins += t.cofins ?? 0;
      const stv = t.icmsSt ?? 0; st += stv; if (stv > 0) notasComSt++;
      const fv = safe(d.fiscalValidation); inconsistencias += (fv?.inconsistencias?.length ?? 0);
      if (d.issueDate) { const ts = new Date(d.issueDate).getTime(); if (minDate === null || ts < minDate) minDate = ts; if (maxDate === null || ts > maxDate) maxDate = ts; }
      for (const it of (nf.itens ?? [])) {
        if (!it.ncm) continue;
        const cur = ncmTotais.get(it.ncm) ?? { total: 0, desc: it.descricao };
        cur.total += it.valor ?? 0; ncmTotais.set(it.ncm, cur);
      }
    }
    const totalImpostos = icms + ipi + pis + cofins + st;
    const topNcms = [...ncmTotais.entries()].map(([ncm, v]) => ({ ncm, desc: v.desc, total: v.total }))
      .sort((a, b) => b.total - a.total).slice(0, 12);

    // período coberto pelas notas → anualiza o faturamento (RBT12 estimado)
    const meses = minDate && maxDate ? Math.max(1, Math.round((maxDate - minDate) / (30 * 864e5)) + 1) : 12;
    const rbt12 = meses >= 12 ? faturamento : faturamento / meses * 12;

    // Carga REAL: Simples paga via DAS (não destaca na nota). Calcula o DAS.
    let cargaTributaria: number, das: any = null;
    if (company.taxRegime === 'SIMPLES_NACIONAL') {
      das = calcularDasSimples(company.segmentoFiscal ?? undefined, rbt12);
      cargaTributaria = das.aliquotaEfetiva; // alíquota efetiva do Simples = carga real
    } else {
      cargaTributaria = faturamento > 0 ? (totalImpostos / faturamento) * 100 : 0;
    }

    return {
      company, numNotas: docs.length, faturamento, rbt12, mesesCobertos: meses, das,
      impostos: { icms, ipi, pis, cofins, st, total: totalImpostos },
      cargaTributaria, notasComSt, inconsistencias, topNcms,
    };
  }

  async gerar(companyId: string) {
    const ag = await this.agregar(companyId);
    if (!ag || ag.numNotas === 0) return { ok: false, motivo: 'sem documentos analisados' };
    const insight = await this.ai.gerarInsightsContabeis({
      nome: ag.company.name, regime: ag.company.taxRegime, segmento: ag.company.segmentoFiscal ?? undefined,
      faturamento: ag.faturamento, cargaTributaria: ag.cargaTributaria, impostos: ag.impostos,
      numNotas: ag.numNotas, topNcms: ag.topNcms, notasComSt: ag.notasComSt, inconsistencias: ag.inconsistencias,
      das: ag.das, rbt12: ag.rbt12,
    });
    const payload = JSON.stringify({ ...insight, agregado: { faturamento: ag.faturamento, rbt12: ag.rbt12, das: ag.das, impostos: ag.impostos, cargaTributaria: ag.cargaTributaria, numNotas: ag.numNotas, notasComSt: ag.notasComSt, topNcms: ag.topNcms } });
    await this.prisma.clienteInsight.upsert({
      where: { companyId },
      create: { companyId, payload, scoreSaude: insight.scoreSaude ?? null, cargaTributaria: ag.cargaTributaria, faturamento: ag.faturamento, economiaPotencial: insight.economiaPotencial ?? null, modelo: 'claude-sonnet-4-6' },
      update: { payload, scoreSaude: insight.scoreSaude ?? null, cargaTributaria: ag.cargaTributaria, faturamento: ag.faturamento, economiaPotencial: insight.economiaPotencial ?? null, geradoEm: new Date() },
    });
    return { ok: true, companyId, score: insight.scoreSaude };
  }

  /** Processa em lote os clientes com documentos e ainda sem insight. */
  async gerarLote(limit = 50, forcar = false) {
    const comDocs = await this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } });
    let ids = comDocs.map((c) => c.companyId);
    if (!forcar) {
      const jaTem = new Set((await this.prisma.clienteInsight.findMany({ select: { companyId: true } })).map((i) => i.companyId));
      ids = ids.filter((id) => !jaTem.has(id));
    }
    ids = ids.slice(0, limit);
    let ok = 0, falhas = 0;
    for (const id of ids) {
      try { const r = await this.gerar(id); r.ok ? ok++ : falhas++; }
      catch (e: any) { falhas++; this.logger.warn(`insight ${id}: ${e.message}`); }
    }
    return { processados: ids.length, ok, falhas };
  }

  async get(companyId: string) {
    const i = await this.prisma.clienteInsight.findUnique({ where: { companyId } });
    if (!i) return null;
    return { ...i, payload: safe(i.payload) };
  }

  async progresso() {
    const [comDocs, comInsight] = await Promise.all([
      this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } }),
      this.prisma.clienteInsight.count(),
    ]);
    return { clientesComDocs: comDocs.length, comInsight, restantes: Math.max(0, comDocs.length - comInsight) };
  }

  /** Visão gerencial: ranking de oportunidades e carga tributária da carteira. */
  async overview() {
    const insights = await this.prisma.clienteInsight.findMany({
      orderBy: { scoreSaude: 'asc' },
      select: { companyId: true, scoreSaude: true, cargaTributaria: true, faturamento: true, economiaPotencial: true, payload: true },
    });
    const companies = await this.prisma.company.findMany({ where: { id: { in: insights.map((i) => i.companyId) } }, select: { id: true, name: true, taxRegime: true } });
    const nome = new Map(companies.map((c) => [c.id, c]));
    const lista = insights.map((i) => {
      const p = safe(i.payload) ?? {};
      return {
        companyId: i.companyId, cliente: nome.get(i.companyId)?.name, regime: nome.get(i.companyId)?.taxRegime,
        score: i.scoreSaude, cargaTributaria: i.cargaTributaria, faturamento: i.faturamento,
        economiaPotencial: i.economiaPotencial, resumo: p.resumoExecutivo,
        oportunidades: p.fiscal?.oportunidades?.length ?? 0, riscos: p.fiscal?.riscos?.length ?? 0,
      };
    });
    const cargaMedia = lista.length ? lista.reduce((s, l) => s + (l.cargaTributaria ?? 0), 0) / lista.length : 0;
    return {
      total: lista.length,
      cargaTributariaMedia: Math.round(cargaMedia * 10) / 10,
      scoreMedia: lista.length ? Math.round(lista.reduce((s, l) => s + (l.score ?? 0), 0) / lista.length) : 0,
      atencao: lista.filter((l) => (l.score ?? 100) < 70).slice(0, 15),
      maiorCarga: [...lista].sort((a, b) => (b.cargaTributaria ?? 0) - (a.cargaTributaria ?? 0)).slice(0, 10),
    };
  }
}
