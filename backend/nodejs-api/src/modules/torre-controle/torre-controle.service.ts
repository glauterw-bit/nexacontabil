import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { STAGES } from '../workflow/workflow.service';

/** Papéis que operam (analistas/contadores) — excluímos 'cliente'. */
const OPERA_ROLES = ['owner', 'contador', 'assistente', 'analista', 'user'];

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class TorreControleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visão consolidada do escritório inteiro em UMA chamada (otimizado pra
   * a Torre de Controle não disparar 20 requests). Agrega produção dos
   * analistas, funil de estágios, fluxo operacional ao vivo, pendências
   * dos clientes e distribuição de carga.
   */
  async overview(competencia?: string, analistaId?: string) {
    const comp = competencia || competenciaAtual();
    const now = new Date();
    const [ano, mes] = comp.split('-').map(Number);
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes = new Date(ano, mes, 1);

    const taskWhere: any = { competencia: comp };
    if (analistaId) taskWhere.analystId = analistaId;

    const [tasks, users, assignments, companies] = await Promise.all([
      this.prisma.workflowTask.findMany({
        where: taskWhere,
        select: {
          id: true, companyId: true, analystId: true, stage: true, status: true,
          slaDate: true, completedAt: true, completedBy: true, startedAt: true, updatedAt: true,
          blockedReason: true,
        },
      }),
      this.prisma.user.findMany({
        where: { active: true, role: { in: OPERA_ROLES } },
        select: { id: true, name: true, role: true },
      }),
      this.prisma.clientAssignment.findMany({
        where: { active: true },
        select: { analystId: true, companyId: true },
      }),
      this.prisma.company.findMany({ select: { id: true, name: true } }),
    ]);

    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const userName = new Map(users.map((u) => [u.id, u.name]));

    // ── PULSO ───────────────────────────────────────────────
    const total = tasks.length;
    const concluidas = tasks.filter((t) => t.status === 'concluida').length;
    const emAndamento = tasks.filter((t) => t.status === 'em_andamento').length;
    const bloqueadas = tasks.filter((t) => t.status === 'bloqueada').length;
    const vencidas = tasks.filter((t) => t.status !== 'concluida' && t.slaDate && t.slaDate < now).length;
    const avaliaveis = tasks.filter((t) => t.slaDate).length;
    const noPrazo = avaliaveis - vencidas;
    const pctSla = avaliaveis > 0 ? Math.round((noPrazo / avaliaveis) * 100) : 100;
    const pctProducao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

    const [docsEnviados, obrigacoesAtrasadas, honorariosAtraso, boletoStats] = await Promise.all([
      this.prisma.relatorioEnvio.count({ where: { status: 'enviado', createdAt: { gte: inicioMes, lt: fimMes } } }),
      this.prisma.fiscalObligation.count({ where: { OR: [{ status: 'overdue' }, { status: 'pending', dueDate: { lt: now } }] } }),
      this.prisma.honorario.count({ where: { OR: [{ status: 'atrasado' }, { status: 'pendente', vencimento: { lt: now } }] } }),
      this.computeInadimplencia(now),
    ]);

    const pulso = {
      pctProducao, concluidas, total,
      pctSla, vencidas, noPrazo,
      emAndamento, bloqueadas,
      docsEnviados,
      pendencias: obrigacoesAtrasadas + honorariosAtraso,
      inadimplencia: boletoStats,
    };

    // ── PRODUÇÃO POR ANALISTA ────────────────────────────────
    const carteiraPorAnalista = new Map<string, number>();
    for (const a of assignments) carteiraPorAnalista.set(a.analystId, (carteiraPorAnalista.get(a.analystId) ?? 0) + 1);

    const analistas = users.map((u) => {
      const mine = tasks.filter((t) => t.analystId === u.id);
      const mConcl = mine.filter((t) => t.status === 'concluida').length;
      const mVenc = mine.filter((t) => t.status !== 'concluida' && t.slaDate && t.slaDate < now).length;
      const mAval = mine.filter((t) => t.slaDate).length;
      const mSla = mAval > 0 ? Math.round(((mAval - mVenc) / mAval) * 100) : 100;
      return {
        analystId: u.id,
        nome: u.name,
        role: u.role,
        carteira: carteiraPorAnalista.get(u.id) ?? 0,
        total: mine.length,
        concluidas: mConcl,
        emAndamento: mine.filter((t) => t.status === 'em_andamento').length,
        bloqueadas: mine.filter((t) => t.status === 'bloqueada').length,
        vencidas: mVenc,
        pctConclusao: mine.length > 0 ? Math.round((mConcl / mine.length) * 100) : 0,
        pctSla: mSla,
      };
    })
      .filter((a) => a.total > 0 || a.carteira > 0)
      .sort((a, b) => b.pctConclusao - a.pctConclusao || b.concluidas - a.concluidas);

    // ── FUNIL DE ESTÁGIOS ────────────────────────────────────
    const estagios = STAGES.map((s) => {
      const list = tasks.filter((t) => t.stage === s.key);
      const abertas = list.filter((t) => t.status !== 'concluida').length;
      return {
        stage: s.key, label: s.label, color: s.color,
        total: list.length,
        abertas,
        concluidas: list.filter((t) => t.status === 'concluida').length,
        vencidas: list.filter((t) => t.status !== 'concluida' && t.slaDate && t.slaDate < now).length,
      };
    });
    const gargalo = [...estagios].sort((a, b) => b.abertas - a.abertas)[0];

    // ── FLUXO OPERACIONAL AO VIVO ────────────────────────────
    const fluxo = await this.montarFluxo(comp, companyName, userName, now);

    // ── PENDÊNCIAS DOS CLIENTES ──────────────────────────────
    const respPorEmpresa = new Map<string, string>();
    for (const a of assignments) if (!respPorEmpresa.has(a.companyId)) respPorEmpresa.set(a.companyId, a.analystId);
    const pendencias = await this.montarPendencias(now, companyName, userName, respPorEmpresa);

    // ── CARGA POR ANALISTA ───────────────────────────────────
    const carga = users
      .map((u) => ({ nome: u.name, clientes: carteiraPorAnalista.get(u.id) ?? 0 }))
      .filter((c) => c.clientes > 0)
      .sort((a, b) => b.clientes - a.clientes);
    const semResponsavel = companies.filter((c) => !respPorEmpresa.has(c.id)).length;

    return {
      competencia: comp,
      atualizadoEm: now.toISOString(),
      pulso,
      analistas,
      estagios,
      gargalo: gargalo && gargalo.abertas > 0 ? gargalo : null,
      fluxo,
      pendencias,
      carga: { porAnalista: carga, semResponsavel, totalClientes: companies.length },
    };
  }

  private async computeInadimplencia(now: Date) {
    const boletos = await this.prisma.boleto.findMany({
      select: { status: true, amount: true, dueDate: true, paidAt: true },
    });
    let vencidos = 0, valorVencido = 0, total = boletos.length, pagos = 0;
    for (const b of boletos) {
      if (b.status === 'paid') { pagos++; continue; }
      if (b.status !== 'cancelled' && b.dueDate < now) { vencidos++; valorVencido += b.amount; }
    }
    const taxa = total > 0 ? Math.round((vencidos / total) * 1000) / 10 : 0;
    return { vencidos, valorVencido: Math.round(valorVencido * 100) / 100, taxa, total, pagos };
  }

  private async montarFluxo(comp: string, companyName: Map<string, string>, userName: Map<string, string>, now: Date) {
    const [concluidas, envios, notifs] = await Promise.all([
      this.prisma.workflowTask.findMany({
        where: { competencia: comp, status: 'concluida', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' }, take: 12,
        select: { stage: true, completedAt: true, completedBy: true, companyId: true, analystId: true },
      }),
      this.prisma.relatorioEnvio.findMany({
        orderBy: { createdAt: 'desc' }, take: 12,
        select: { canal: true, status: true, destino: true, companyId: true, createdAt: true },
      }),
      this.prisma.notification.findMany({
        where: { tipo: { in: ['sla_vencendo', 'tarefa_atribuida', 'cliente_atribuido'] } },
        orderBy: { createdAt: 'desc' }, take: 8,
        select: { tipo: true, titulo: true, corpo: true, createdAt: true },
      }),
    ]);

    const eventos: Array<{ tipo: string; icone: string; texto: string; ator?: string; quando: string }> = [];

    for (const t of concluidas) {
      const stage = STAGES.find((s) => s.key === t.stage)?.label ?? t.stage;
      eventos.push({
        tipo: 'conclusao', icone: 'check',
        texto: `${stage} · ${companyName.get(t.companyId) ?? 'cliente'}`,
        ator: t.completedBy ? userName.get(t.completedBy) : (t.analystId ? userName.get(t.analystId) : undefined),
        quando: (t.completedAt ?? now).toISOString(),
      });
    }
    for (const e of envios) {
      eventos.push({
        tipo: 'envio', icone: e.canal === 'email' ? 'mail' : 'message',
        texto: `Relatório por ${e.canal} → ${companyName.get(e.companyId) ?? e.destino}${e.status !== 'enviado' ? ' (falhou)' : ''}`,
        quando: e.createdAt.toISOString(),
      });
    }
    for (const n of notifs) {
      eventos.push({ tipo: n.tipo, icone: 'bell', texto: n.titulo, quando: n.createdAt.toISOString() });
    }

    return eventos.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 20);
  }

  private async montarPendencias(
    now: Date,
    companyName: Map<string, string>,
    userName: Map<string, string>,
    respPorEmpresa: Map<string, string>,
  ) {
    const [obrigacoes, honorarios] = await Promise.all([
      this.prisma.fiscalObligation.findMany({
        where: { OR: [{ status: 'overdue' }, { status: 'pending', dueDate: { lt: now } }] },
        orderBy: { dueDate: 'asc' }, take: 40,
        select: { companyId: true, name: true, dueDate: true },
      }),
      this.prisma.honorario.findMany({
        where: { OR: [{ status: 'atrasado' }, { status: 'pendente', vencimento: { lt: now } }] },
        orderBy: { vencimento: 'asc' }, take: 20,
        select: { companyId: true, descricao: true, vencimento: true, valor: true },
      }),
    ]);

    const dias = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
    const sev = (dd: number) => (dd > 15 ? 'alta' : dd > 5 ? 'media' : 'baixa');

    const out = [
      ...obrigacoes.map((o) => {
        const dd = dias(o.dueDate);
        return {
          tipo: 'obrigacao', cliente: companyName.get(o.companyId) ?? 'cliente',
          pendencia: o.name, diasParado: dd, severidade: sev(dd),
          responsavel: respPorEmpresa.has(o.companyId) ? userName.get(respPorEmpresa.get(o.companyId)!) : null,
        };
      }),
      ...honorarios.map((h) => {
        const dd = dias(h.vencimento);
        return {
          tipo: 'honorario', cliente: companyName.get(h.companyId) ?? 'cliente',
          pendencia: `Honorário em atraso: ${h.descricao} (R$ ${h.valor.toFixed(2)})`,
          diasParado: dd, severidade: sev(dd),
          responsavel: respPorEmpresa.has(h.companyId) ? userName.get(respPorEmpresa.get(h.companyId)!) : null,
        };
      }),
    ].sort((a, b) => b.diasParado - a.diasParado).slice(0, 30);

    return out;
  }
}
