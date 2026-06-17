import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { calcularDasSimples } from '../insights/simples-nacional.util';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

// presunção de lucro p/ IRPJ/CSLL no Lucro Presumido
function presuncao(segmento?: string) {
  const s = (segmento ?? '').toLowerCase();
  if (s === 'servico') return { irpj: 0.32, csll: 0.32 };
  return { irpj: 0.08, csll: 0.12 }; // comércio/indústria
}

@Injectable()
export class ApuracaoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agrega os documentos de um cliente por competência (mês). */
  private async porMes(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, taxRegime: true, segmentoFiscal: true },
    });
    if (!company) return null;
    const docs = await this.prisma.document.findMany({
      where: { companyId, extractedData: { not: null } },
      select: { totalValue: true, issueDate: true, extractedData: true },
    });

    const meses = new Map<string, any>();
    let fatTotal = 0, minD: number | null = null, maxD: number | null = null;
    for (const d of docs) {
      const nf = safe(d.extractedData); if (!nf) continue;
      const comp = d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 7) : 'sem-data';
      const t = nf.totais ?? {};
      const it0 = (nf.itens ?? [])[0] ?? {};
      const dir = String(it0.cfop ?? '')[0];
      const saida = ['5', '6', '7'].includes(dir);
      const entrada = ['1', '2', '3'].includes(dir);
      const v = d.totalValue ?? t.produtos ?? 0;
      if (d.issueDate) { const ts = +new Date(d.issueDate); if (minD === null || ts < minD) minD = ts; if (maxD === null || ts > maxD) maxD = ts; }

      const m = meses.get(comp) ?? { competencia: comp, receita: 0, icmsDeb: 0, icmsCred: 0, pis: 0, cofins: 0, ipi: 0, st: 0, notas: 0, entradas: 0, saidas: 0 };
      m.notas++;
      if (saida) { m.saidas++; m.receita += v; m.icmsDeb += t.icms ?? 0; m.pis += t.pis ?? 0; m.cofins += t.cofins ?? 0; m.ipi += t.ipi ?? 0; m.st += t.icmsSt ?? 0; fatTotal += v; }
      else if (entrada) { m.entradas++; m.icmsCred += t.icms ?? 0; }
      else { m.receita += v; fatTotal += v; } // NFS-e / indef: trata como receita
      meses.set(comp, m);
    }
    const mesesCob = minD && maxD ? Math.max(1, Math.round((maxD - minD) / (30 * 864e5)) + 1) : 1;
    const rbt12 = mesesCob >= 12 ? fatTotal : fatTotal / mesesCob * 12;
    return { company, meses: [...meses.values()].sort((a, b) => a.competencia.localeCompare(b.competencia)), rbt12, fatTotal };
  }

  /** Apuração de UM cliente: impostos a recolher por competência. */
  async cliente(companyId: string) {
    const ag = await this.porMes(companyId);
    if (!ag) return { erro: 'cliente não encontrado' };
    const { company, rbt12 } = ag;
    const regime = company.taxRegime;
    const pres = presuncao(company.segmentoFiscal ?? undefined);
    const das = calcularDasSimples(company.segmentoFiscal ?? undefined, rbt12);

    const apuracoes = ag.meses.map((m: any) => {
      const tributos: any[] = [];
      let credIncompleto = false;
      if (regime === 'SIMPLES_NACIONAL') {
        const valor = r2(m.receita * (das.aliquotaEfetiva / 100));
        tributos.push({ nome: 'DAS', base: r2(m.receita), aliquota: das.aliquotaEfetiva, valor, obs: `Anexo ${das.anexo}` });
      } else {
        const icms = r2(Math.max(0, m.icmsDeb - m.icmsCred));
        if (m.entradas === 0 && m.icmsDeb > 0) credIncompleto = true;
        tributos.push({ nome: 'ICMS', base: r2(m.receita), debito: r2(m.icmsDeb), credito: r2(m.icmsCred), valor: icms });
        // PIS/COFINS: usa o destacado nas saídas (LP cumulativo; LR aproxima)
        tributos.push({ nome: 'PIS', valor: r2(m.pis) });
        tributos.push({ nome: 'COFINS', valor: r2(m.cofins) });
        if (m.ipi > 0) tributos.push({ nome: 'IPI', valor: r2(m.ipi) });
        if (regime === 'LUCRO_PRESUMIDO') {
          tributos.push({ nome: 'IRPJ (presumido)', base: r2(m.receita * pres.irpj), aliquota: 15, valor: r2(m.receita * pres.irpj * 0.15), estimado: true });
          tributos.push({ nome: 'CSLL (presumido)', base: r2(m.receita * pres.csll), aliquota: 9, valor: r2(m.receita * pres.csll * 0.09), estimado: true });
        }
      }
      const total = r2(tributos.reduce((s, t) => s + (t.valor || 0), 0));
      return { competencia: m.competencia, receita: r2(m.receita), notas: m.notas, entradas: m.entradas, saidas: m.saidas, st: r2(m.st), tributos, total, credIncompleto };
    });

    const totalGeral = r2(apuracoes.reduce((s: number, a: any) => s + a.total, 0));
    return {
      empresa: { id: company.id, nome: company.name, regime, segmento: company.segmentoFiscal },
      rbt12: r2(rbt12), dasEfetiva: regime === 'SIMPLES_NACIONAL' ? das.aliquotaEfetiva : null,
      competencias: apuracoes.length, totalApurado: totalGeral,
      semEntradas: apuracoes.some((a: any) => a.credIncompleto),
      apuracoes,
    };
  }

  /** Visão da carteira: total apurado por regime e por competência. */
  async overview() {
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true, taxRegime: true } });
    const ids = new Set(companies.map((c) => c.id));
    const regimeBy = new Map(companies.map((c) => [c.id, c.taxRegime]));
    const docs = await this.prisma.document.findMany({
      where: { companyId: { in: [...ids] }, extractedData: { not: null } },
      select: { companyId: true, totalValue: true, issueDate: true, extractedData: true },
    });
    const porRegime = new Map<string, { receita: number; icms: number; pisCofins: number; st: number; notas: number }>();
    const porMes = new Map<string, number>();
    let receitaTotal = 0, icmsTotal = 0, pisCofinsTotal = 0;
    for (const d of docs) {
      const nf = safe(d.extractedData); if (!nf) continue;
      const reg = regimeBy.get(d.companyId) ?? 'n/d';
      const t = nf.totais ?? {};
      const it0 = (nf.itens ?? [])[0] ?? {};
      const saida = ['5', '6', '7'].includes(String(it0.cfop ?? '')[0]);
      const v = d.totalValue ?? t.produtos ?? 0;
      const cur = porRegime.get(reg) ?? { receita: 0, icms: 0, pisCofins: 0, st: 0, notas: 0 };
      cur.notas++;
      if (saida || (it0.cfop ?? '') === '') {
        cur.receita += v; receitaTotal += v;
        cur.icms += t.icms ?? 0; icmsTotal += t.icms ?? 0;
        cur.pisCofins += (t.pis ?? 0) + (t.cofins ?? 0); pisCofinsTotal += (t.pis ?? 0) + (t.cofins ?? 0);
        cur.st += t.icmsSt ?? 0;
        if (d.issueDate) { const c = new Date(d.issueDate).toISOString().slice(0, 7); porMes.set(c, (porMes.get(c) ?? 0) + v); }
      }
      porRegime.set(reg, cur);
    }
    return {
      receitaTotal: r2(receitaTotal), icmsTotal: r2(icmsTotal), pisCofinsTotal: r2(pisCofinsTotal),
      porRegime: [...porRegime.entries()].map(([regime, x]) => ({ regime, ...x, receita: r2(x.receita), icms: r2(x.icms), pisCofins: r2(x.pisCofins), st: r2(x.st) })).sort((a, b) => b.receita - a.receita),
      porMes: [...porMes.entries()].map(([competencia, receita]) => ({ competencia, receita: r2(receita) })).sort((a, b) => a.competencia.localeCompare(b.competencia)),
    };
  }
}
