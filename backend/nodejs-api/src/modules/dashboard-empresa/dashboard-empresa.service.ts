import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PredictiveService } from '../predictive/predictive.service';
import { HealthScoreService } from '../health-score/health-score.service';
import { STAGES } from '../workflow/workflow.service';

@Injectable()
export class DashboardEmpresaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly predictive: PredictiveService,
    private readonly health: HealthScoreService,
  ) {}

  async overview(companyId: string) {
    if (!companyId) throw new BadRequestException('companyId obrigatório');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const now = new Date();
    const comp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [tasks, obrigacoes, honorarios, documents] = await Promise.all([
      this.prisma.workflowTask.findMany({ where: { companyId, competencia: comp } }),
      this.prisma.fiscalObligation.findMany({ where: { companyId }, orderBy: { dueDate: 'asc' }, take: 60 }),
      this.prisma.honorario.findMany({ where: { companyId, status: { in: ['pendente', 'atrasado'] } } }),
      this.prisma.document.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    ]);

    // ── Cronograma fiscal e contábil (7 etapas) ──
    const etapas = STAGES.map((s) => {
      const t = tasks.find((x) => x.stage === s.key);
      const vencida = t && t.status !== 'concluida' && t.slaDate && t.slaDate < now;
      return {
        stage: s.key, label: s.label, color: s.color,
        status: t?.status ?? 'sem_tarefa',
        slaDate: t?.slaDate ?? null,
        completedAt: t?.completedAt ?? null,
        vencida: !!vencida,
      };
    });
    const concluidas = tasks.filter((t) => t.status === 'concluida').length;

    // ── Obrigações fiscais (calendário) ──
    const obrigVencidas = obrigacoes.filter((o) => o.status === 'overdue' || (o.status === 'pending' && o.dueDate < now));
    const obrigProximas = obrigacoes
      .filter((o) => o.status !== 'completed' && o.dueDate >= now)
      .slice(0, 8)
      .map((o) => ({ nome: o.name, tipo: o.type, venc: o.dueDate, status: o.status }));

    // ── Pendências (vencido em tarefas + obrigações + honorários) ──
    const tarefasVencidas = tasks.filter((t) => t.status !== 'concluida' && t.slaDate && t.slaDate < now);
    const dias = (d: Date) => Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / 86400000));
    const pendencias = [
      ...tarefasVencidas.map((t) => ({ tipo: 'tarefa', titulo: STAGES.find((s) => s.key === t.stage)?.label ?? t.stage, diasAtraso: dias(t.slaDate) })),
      ...obrigVencidas.map((o) => ({ tipo: 'obrigacao', titulo: o.name, diasAtraso: dias(o.dueDate) })),
      ...honorarios.filter((h) => h.vencimento < now).map((h) => ({ tipo: 'honorario', titulo: h.descricao, diasAtraso: dias(h.vencimento) })),
    ].sort((a, b) => b.diasAtraso - a.diasAtraso);

    // ── Documentos analisados + ANÁLISE FISCAL PROFUNDA ──
    const analisados = documents.filter((d) => d.status === 'completed' || !!d.extractedData);
    let faturamento = 0, tIcms = 0, tIpi = 0, tPis = 0, tCofins = 0, tIcmsSt = 0;
    const porNcm = new Map<string, { ncm: string; descricao: string; qtd: number; valor: number }>();
    const porCfop = new Map<string, { cfop: string; qtd: number; valor: number }>();
    const inconsistenciasDetalhe: Array<{ doc: string; problemas: string[] }> = [];
    let totalInconsist = 0;

    for (const d of documents) {
      faturamento += d.totalValue ?? 0;
      let nf: any = null, fv: any = null;
      try { nf = d.extractedData ? JSON.parse(d.extractedData) : null; } catch { /* */ }
      try { fv = d.fiscalValidation ? JSON.parse(d.fiscalValidation) : null; } catch { /* */ }
      if (nf?.totais) {
        tIcms += nf.totais.icms ?? 0; tIpi += nf.totais.ipi ?? 0;
        tPis += nf.totais.pis ?? 0; tCofins += nf.totais.cofins ?? 0; tIcmsSt += nf.totais.icmsSt ?? 0;
      }
      for (const it of (nf?.itens ?? [])) {
        const v = it.valor ?? 0;
        if (it.ncm) {
          const k = String(it.ncm);
          const cur = porNcm.get(k) ?? { ncm: k, descricao: it.descricao ?? '', qtd: 0, valor: 0 };
          cur.qtd++; cur.valor += v; if (!cur.descricao && it.descricao) cur.descricao = it.descricao;
          porNcm.set(k, cur);
        }
        if (it.cfop) {
          const cur = porCfop.get(it.cfop) ?? { cfop: it.cfop, qtd: 0, valor: 0 };
          cur.qtd++; cur.valor += v; porCfop.set(it.cfop, cur);
        }
      }
      if (fv?.inconsistencias?.length) {
        totalInconsist += fv.inconsistencias.length;
        if (inconsistenciasDetalhe.length < 15) inconsistenciasDetalhe.push({ doc: d.number ? `NF ${d.number}` : (d.originalFilename ?? d.type), problemas: fv.inconsistencias.slice(0, 3) });
      }
    }
    const totalImpostos = tIcms + tIpi + tPis + tCofins + tIcmsSt;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const documentos = {
      total: documents.length,
      analisados: analisados.length,
      pendentes: documents.filter((d) => d.status === 'pending').length,
      valorTotal: r2(faturamento),
      recentes: documents.slice(0, 6).map((d) => ({
        nome: d.originalFilename ?? d.type, tipo: d.type,
        valor: d.totalValue, emitente: d.issuerName, status: d.status,
        confianca: d.confidenceScore, em: d.createdAt,
      })),
      resumoFiscal: {
        faturamento: r2(faturamento),
        impostos: { icms: r2(tIcms), ipi: r2(tIpi), pis: r2(tPis), cofins: r2(tCofins), icmsSt: r2(tIcmsSt), total: r2(totalImpostos) },
        cargaTributaria: faturamento > 0 ? Math.round((totalImpostos / faturamento) * 1000) / 10 : 0,
        topNcm: [...porNcm.values()].sort((a, b) => b.valor - a.valor).slice(0, 8).map((x) => ({ ...x, valor: r2(x.valor) })),
        topCfop: [...porCfop.values()].sort((a, b) => b.valor - a.valor).slice(0, 6).map((x) => ({ ...x, valor: r2(x.valor) })),
        totalInconsistencias: totalInconsist,
        inconsistencias: inconsistenciasDetalhe,
      },
    };

    // ── Análises da IA (fiscais e contábeis) ──
    let malhaFina: any = null, saudeFiscal: any = null, folhaAnomalias = 0;
    try {
      const m = await this.predictive.predictMalhaFina(companyId);
      malhaFina = { score: m.score, level: m.level, fatores: (m.fatores ?? []).slice(0, 3), recomendacoes: (m.recomendacoes ?? []).slice(0, 2) };
    } catch { /* ignore */ }
    try {
      const h: any = await this.health.compute(companyId);
      saudeFiscal = { score: h.scoreGeral, dimensoes: (h.dimensoes ?? []).map((d: any) => ({ nome: d.nome, score: d.score })) };
    } catch { /* ignore */ }
    try {
      const a = await this.predictive.detectFolhaAnomalies(companyId);
      folhaAnomalias = a.length;
    } catch { /* ignore */ }

    return {
      empresa: { id: company.id, nome: company.name, cnpj: company.cnpj, regime: company.taxRegime },
      competencia: comp,
      cronograma: { etapas, concluidas, total: tasks.length, pct: tasks.length ? Math.round((concluidas / tasks.length) * 100) : 0 },
      obrigacoes: { vencidas: obrigVencidas.length, proximas: obrigProximas },
      pendencias: pendencias.slice(0, 12),
      totalPendencias: pendencias.length,
      documentos,
      analiseIA: { malhaFina, saudeFiscal, folhaAnomalias },
      atualizadoEm: now.toISOString(),
    };
  }
}
