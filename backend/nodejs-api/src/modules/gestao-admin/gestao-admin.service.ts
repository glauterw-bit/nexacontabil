import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { STAGES } from '../workflow/workflow.service';

@Injectable()
export class GestaoAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Gerar obrigações fiscais por regime ─────────────────
  async gerarObrigacoes() {
    const clientes = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, taxRegime: true },
    });
    const now = new Date();
    let criadas = 0;
    // gera mês anterior (vira pendência), atual e próximo
    const meses = [-1, 0, 1].map((off) => new Date(now.getFullYear(), now.getMonth() + off, 1));

    for (const c of clientes) {
      const templates = obrigacoesPorRegime(c.taxRegime);
      for (const mesBase of meses) {
        const ref = `${mesBase.getFullYear()}-${String(mesBase.getMonth() + 1).padStart(2, '0')}`;
        for (const t of templates) {
          // vencimento no mês SEGUINTE ao de referência (apuração)
          const venc = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, t.dia);
          const exists = await this.prisma.fiscalObligation.findFirst({
            where: { companyId: c.id, name: t.name, referenceMonth: ref },
          });
          if (exists) continue;
          await this.prisma.fiscalObligation.create({
            data: {
              companyId: c.id, name: t.name, type: t.type,
              dueDate: venc, referenceMonth: ref,
              status: venc < now ? 'overdue' : 'pending', alertDays: 5,
            },
          });
          criadas++;
        }
      }
    }
    return { clientes: clientes.length, obrigacoesCriadas: criadas };
  }

  // ─── 2. Derivar segmento fiscal pelo nome ───────────────────
  async derivarSegmentos() {
    const clientes = await this.prisma.company.findMany({ select: { id: true, name: true, segmentoFiscal: true } });
    let atualizados = 0;
    const dist: Record<string, number> = {};
    for (const c of clientes) {
      const seg = segmentoFromName(c.name);
      dist[seg] = (dist[seg] ?? 0) + 1;
      if (c.segmentoFiscal !== seg) {
        await this.prisma.company.update({ where: { id: c.id }, data: { segmentoFiscal: seg } });
        atualizados++;
      }
    }
    return { total: clientes.length, atualizados, distribuicao: dist };
  }

  // ─── Extrair CNPJ real dos XMLs ─────────────────────────────
  async extrairCnpjReal() {
    const clientes = await this.prisma.company.findMany({
      where: { sharepointItemId: { not: null } }, select: { id: true, name: true, cnpj: true },
    });
    let atualizados = 0, semDados = 0, conflitos = 0, jaReal = 0;
    for (const c of clientes) {
      if (!c.cnpj?.startsWith('7')) { jaReal++; continue; } // já tem CNPJ real
      const docs = await this.prisma.document.findMany({ where: { companyId: c.id }, select: { extractedData: true }, take: 300 });
      // conta em quantos DOCUMENTOS cada CNPJ aparece (o do cliente aparece em ~todos)
      const freq = new Map<string, { docs: number; nome?: string }>();
      for (const d of docs) {
        let nf: any; try { nf = JSON.parse(d.extractedData as string); } catch { continue; }
        const noDoc = new Map<string, string | undefined>();
        if (nf.emitenteCnpj && String(nf.emitenteCnpj).length === 14) noDoc.set(nf.emitenteCnpj, nf.emitenteNome);
        if (nf.destCnpj && String(nf.destCnpj).length === 14) noDoc.set(nf.destCnpj, nf.destNome);
        for (const [cnpj, nome] of noDoc) {
          const cur = freq.get(cnpj) ?? { docs: 0, nome };
          cur.docs++; if (!cur.nome && nome) cur.nome = nome;
          freq.set(cnpj, cur);
        }
      }
      const top = [...freq.entries()].sort((a, b) => b[1].docs - a[1].docs)[0];
      if (!top) { semDados++; continue; }
      const [cnpjReal, info] = top;
      try {
        await this.prisma.company.update({ where: { id: c.id }, data: { cnpj: cnpjReal, ...(info.nome ? { name: info.nome } : {}) } });
        atualizados++;
      } catch { conflitos++; }
    }
    return { total: clientes.length, atualizados, jaReal, semDados, conflitos };
  }

  // ─── 3. Visão administrador: todos os clientes ──────────────
  async clientesOverview() {
    const now = new Date();
    const comp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [companies, docsAgg, tasks, obrigVenc] = await Promise.all([
      this.prisma.company.findMany({
        where: { active: true },
        select: { id: true, name: true, cnpj: true, taxRegime: true, segmentoFiscal: true, clienteCodigo: true, sharepointDocsCount: true },
      }),
      this.prisma.document.groupBy({ by: ['companyId'], _sum: { totalValue: true }, _count: { _all: true } }),
      this.prisma.workflowTask.findMany({ where: { competencia: comp }, select: { companyId: true, status: true, slaDate: true } }),
      this.prisma.fiscalObligation.findMany({ where: { OR: [{ status: 'overdue' }, { status: 'pending', dueDate: { lt: now } }] }, select: { companyId: true } }),
    ]);

    const docByCo = new Map(docsAgg.map((d: any) => [d.companyId, { fat: d._sum.totalValue ?? 0, n: d._count._all }]));
    const taskByCo = new Map<string, { total: number; concl: number; venc: number }>();
    for (const t of tasks) {
      const cur = taskByCo.get(t.companyId) ?? { total: 0, concl: 0, venc: 0 };
      cur.total++;
      if (t.status === 'concluida') cur.concl++;
      if (t.status !== 'concluida' && t.slaDate && t.slaDate < now) cur.venc++;
      taskByCo.set(t.companyId, cur);
    }
    const obrigByCo = new Map<string, number>();
    for (const o of obrigVenc) obrigByCo.set(o.companyId, (obrigByCo.get(o.companyId) ?? 0) + 1);

    const clientes = companies.map((c) => {
      const d = docByCo.get(c.id) ?? { fat: 0, n: 0 };
      const tk = taskByCo.get(c.id) ?? { total: 0, concl: 0, venc: 0 };
      const pend = tk.venc + (obrigByCo.get(c.id) ?? 0);
      return {
        id: c.id, nome: c.name, codigo: c.clienteCodigo, regime: c.taxRegime, segmento: c.segmentoFiscal,
        faturamento: Math.round((d.fat ?? 0) * 100) / 100, docs: d.n,
        cronograma: tk.total ? Math.round((tk.concl / tk.total) * 100) : 0,
        pendencias: pend,
      };
    }).sort((a, b) => b.pendencias - a.pendencias || b.faturamento - a.faturamento);

    const totals = {
      clientes: clientes.length,
      faturamentoTotal: Math.round(clientes.reduce((s, c) => s + c.faturamento, 0) * 100) / 100,
      docsTotal: clientes.reduce((s, c) => s + c.docs, 0),
      comPendencia: clientes.filter((c) => c.pendencias > 0).length,
      porRegime: agrupar(clientes, 'regime'),
      porSegmento: agrupar(clientes, 'segmento'),
    };
    return { totals, clientes };
  }
}

function obrigacoesPorRegime(regime: string): Array<{ name: string; type: string; dia: number }> {
  const trabalhista = [
    { name: 'FGTS Digital', type: 'trabalhista', dia: 20 },
    { name: 'eSocial / DCTFWeb', type: 'trabalhista', dia: 15 },
  ];
  switch (regime) {
    case 'MEI':
      return [{ name: 'DAS-MEI', type: 'federal', dia: 20 }];
    case 'SIMPLES_NACIONAL':
      return [{ name: 'DAS - Simples Nacional', type: 'federal', dia: 20 }, ...trabalhista];
    case 'LUCRO_PRESUMIDO':
      return [
        { name: 'DARF PIS', type: 'federal', dia: 25 }, { name: 'DARF COFINS', type: 'federal', dia: 25 },
        { name: 'EFD-Contribuições', type: 'federal', dia: 14 }, { name: 'DCTFWeb', type: 'federal', dia: 15 },
        ...trabalhista,
      ];
    case 'LUCRO_REAL':
      return [
        { name: 'DARF PIS', type: 'federal', dia: 25 }, { name: 'DARF COFINS', type: 'federal', dia: 25 },
        { name: 'IRPJ / CSLL', type: 'federal', dia: 30 }, { name: 'EFD-Contribuições', type: 'federal', dia: 14 },
        { name: 'DCTFWeb', type: 'federal', dia: 15 }, ...trabalhista,
      ];
    default:
      return [{ name: 'DAS - Simples Nacional', type: 'federal', dia: 20 }, ...trabalhista];
  }
}

function segmentoFromName(name: string): string {
  const n = (name || '').toUpperCase();
  if (/IND[ÚU]STRIA|METAL[ÚU]RGICA|F[ÁA]BRICA|MANUFATURA|TAMPOS|MOVEIS SOB MEDIDA|MÓVEIS SOB/.test(n)) return 'industria';
  if (/TRANSPORTE|TRANSPORTADORA|LOG[ÍI]STICA|\bFRETE\b|EXPRESS|DEPOSITO|DEP[ÓO]SITO|ESTACIONAMENTO/.test(n)) return 'transporte';
  if (/SERVI[ÇC]O|CL[ÍI]NICA|CONSULTORIA|ESCRIT[ÓO]RIO|STUDIO|EST[ÚU]DIO|ENGENHARIA|ADVOCACIA|ASSESSORIA|ACADEMIA|SAL[ÃA]O|BELEZA|ENGLISH|EVENTOS|MARKETING|PRODUTORA|MEC[ÂA]NICO|CONTROL/.test(n)) return 'servico';
  if (/COM[ÉE]RCIO|MERCAD|LOJA|ATACAD|VAREJO|DISTRIBUIDORA|PE[ÇC]AS|\bAUTO\b|FARM[ÁA]CIA|\bPET\b|M[ÓO]VEIS|MODA|CAF[ÉE]|BISTR[ÔO]|RESTAURANTE|PADARIA|ACESS[ÓO]RIOS/.test(n)) return 'comercio';
  return 'comercio';
}

function agrupar(arr: any[], key: string) {
  const m: Record<string, number> = {};
  for (const x of arr) { const k = x[key] ?? 'N/D'; m[k] = (m[k] ?? 0) + 1; }
  return Object.entries(m).map(([k, v]) => ({ chave: k, count: v })).sort((a, b) => b.count - a.count);
}
