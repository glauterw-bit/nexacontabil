import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

export const STAGES = [
  { key: 'recepcao',     label: 'Recepção de Documentos',  slaDias: 3, color: '#6366f1' },
  { key: 'lancamento',   label: 'Lançamento Contábil',      slaDias: 5, color: '#8b5cf6' },
  { key: 'conciliacao',  label: 'Conciliação Bancária',     slaDias: 5, color: '#06b6d4' },
  { key: 'apuracao',     label: 'Apuração de Impostos',     slaDias: 7, color: '#f59e0b' },
  { key: 'obrigacoes',   label: 'Geração de Obrigações',    slaDias: 3, color: '#10b981' },
  { key: 'revisao',      label: 'Revisão Sênior',           slaDias: 2, color: '#ec4899' },
  { key: 'entregue',     label: 'Entregue ao Cliente',      slaDias: 1, color: '#22c55e' },
];

const STAGE_KEYS = STAGES.map((s) => s.key);

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // ─── Atribuição de clientes ─────────────────────────────────

  async assignCompany(companyId: string, analystId: string, assignedById: string, motivo?: string) {
    // desativa atribuicoes anteriores ativas
    await this.prisma.clientAssignment.updateMany({
      where: { companyId, active: true },
      data: { active: false, unassignedAt: new Date() },
    });
    const assignment = await this.prisma.clientAssignment.create({
      data: { companyId, analystId, assignedById, motivo },
    });
    // cria notificacao para o analista
    await this.prisma.notification.create({
      data: {
        companyId,
        userId: analystId,
        tipo: 'cliente_atribuido',
        titulo: 'Novo cliente na sua carteira',
        corpo: motivo ?? 'Você foi designado como responsável por uma nova empresa.',
        link: '/minha-carteira',
      },
    });
    return assignment;
  }

  async bulkReassign(fromAnalystId: string, toAnalystId: string, assignedById: string, motivo: string) {
    if (fromAnalystId === toAnalystId) {
      throw new BadRequestException('Origem e destino sao o mesmo analista');
    }
    const ativas = await this.prisma.clientAssignment.findMany({
      where: { analystId: fromAnalystId, active: true },
    });
    if (ativas.length === 0) return { moved: 0 };

    await this.prisma.$transaction(async (tx) => {
      for (const a of ativas) {
        await tx.clientAssignment.update({
          where: { id: a.id },
          data: { active: false, unassignedAt: new Date() },
        });
        await tx.clientAssignment.create({
          data: {
            companyId: a.companyId,
            analystId: toAnalystId,
            assignedById,
            motivo,
          },
        });
        await tx.notification.create({
          data: {
            companyId: a.companyId,
            userId: toAnalystId,
            tipo: 'cliente_atribuido',
            titulo: 'Cliente transferido para sua carteira',
            corpo: motivo,
            link: '/minha-carteira',
          },
        });
        // reatribui tasks abertas para o novo analista
        await tx.workflowTask.updateMany({
          where: { companyId: a.companyId, status: { in: ['pendente', 'em_andamento'] } },
          data: { analystId: toAnalystId },
        });
      }
    });
    return { moved: ativas.length };
  }

  async listAssignments(filter: { analystId?: string; active?: boolean } = {}) {
    return this.prisma.clientAssignment.findMany({
      where: { ...(filter.analystId ? { analystId: filter.analystId } : {}), ...(filter.active !== undefined ? { active: filter.active } : {}) },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async getCarteira(analystId: string) {
    const assignments = await this.prisma.clientAssignment.findMany({
      where: { analystId, active: true },
      orderBy: { assignedAt: 'desc' },
    });
    const companyIds = assignments.map((a) => a.companyId);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
    });
    return assignments.map((a) => ({
      ...a,
      company: companies.find((c) => c.id === a.companyId),
    }));
  }

  // ─── Tasks ───────────────────────────────────────────────────

  /**
   * Gera (ou recupera) as 7 tasks de um cliente para um competencia.
   * Idempotente — ja roda monthly automaticamente via cron externo.
   */
  async ensureTasksForMonth(companyId: string, competencia: string) {
    const existing = await this.prisma.workflowTask.findMany({
      where: { companyId, competencia },
    });
    if (existing.length === STAGES.length) return existing;

    // analista atual (se houver)
    const assignment = await this.prisma.clientAssignment.findFirst({
      where: { companyId, active: true },
    });
    const analystId = assignment?.analystId;

    // SLA cumulativo: cada estagio comeca apos o anterior
    const [ano, mes] = competencia.split('-').map(Number);
    let cursor = new Date(ano, mes, 1); // dia 1 do mes seguinte = inicio da apuracao

    const created: any[] = [];
    for (const stage of STAGES) {
      const slaDate = addBusinessDays(cursor, stage.slaDias);
      const exists = existing.find((e) => e.stage === stage.key);
      if (exists) {
        created.push(exists);
        cursor = exists.completedAt ?? slaDate;
        continue;
      }
      const task = await this.prisma.workflowTask.create({
        data: {
          companyId,
          analystId,
          stage: stage.key,
          competencia,
          slaDate,
          status: 'pendente',
        },
      });
      created.push(task);
      cursor = slaDate;
    }
    return created;
  }

  async generateMonthForAllCompanies(competencia: string) {
    const companies = await this.prisma.company.findMany({ where: { active: true } });
    let totalCreated = 0;
    for (const c of companies) {
      const tasks = await this.ensureTasksForMonth(c.id, competencia);
      totalCreated += tasks.length;
    }
    return { companies: companies.length, tasks: totalCreated };
  }

  /**
   * Lista tasks em formato Kanban (agrupado por estagio).
   * Filtros opcionais: analystId, competencia, stage.
   */
  async listKanban(filters: { competencia?: string; analystId?: string; stage?: string } = {}) {
    const where: any = {};
    if (filters.competencia) where.competencia = filters.competencia;
    if (filters.analystId) where.analystId = filters.analystId;
    if (filters.stage) where.stage = filters.stage;

    const tasks = await this.prisma.workflowTask.findMany({
      where,
      orderBy: [{ slaDate: 'asc' }],
    });

    const companyIds = Array.from(new Set(tasks.map((t) => t.companyId)));
    const userIds = Array.from(new Set(tasks.map((t) => t.analystId).filter(Boolean) as string[]));

    const companies = await this.prisma.company.findMany({ where: { id: { in: companyIds } } });
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });

    const board = STAGES.map((stage) => ({
      stage: stage.key,
      label: stage.label,
      color: stage.color,
      tasks: tasks
        .filter((t) => t.stage === stage.key)
        .map((t) => ({
          ...t,
          company: companies.find((c) => c.id === t.companyId),
          analyst: t.analystId ? users.find((u) => u.id === t.analystId) : null,
          slaStatus: this.computeSlaStatus(t.slaDate, t.status),
        })),
    }));
    return board;
  }

  private computeSlaStatus(slaDate: Date, status: string): 'no_prazo' | 'vencendo' | 'vencido' | 'concluida' {
    if (status === 'concluida') return 'concluida';
    const now = new Date();
    const diffDays = (new Date(slaDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (diffDays < 0) return 'vencido';
    if (diffDays <= 2) return 'vencendo';
    return 'no_prazo';
  }

  async startTask(taskId: string, userId: string) {
    const t = await this.prisma.workflowTask.findUnique({ where: { id: taskId } });
    if (!t) throw new NotFoundException();
    if (t.status === 'concluida') throw new BadRequestException('Task ja concluida');
    return this.prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        status: 'em_andamento',
        startedAt: t.startedAt ?? new Date(),
        analystId: t.analystId ?? userId,
      },
    });
  }

  async completeTask(taskId: string, userId: string, userName?: string) {
    const t = await this.prisma.workflowTask.findUnique({ where: { id: taskId } });
    if (!t) throw new NotFoundException();
    if (t.status === 'concluida') return t;
    const now = new Date();
    const tempo = t.startedAt
      ? Math.floor((now.getTime() - new Date(t.startedAt).getTime()) / 1000)
      : null;
    const updated = await this.prisma.workflowTask.update({
      where: { id: taskId },
      data: {
        status: 'concluida',
        completedAt: now,
        completedBy: userId,
        tempoSegundos: tempo,
      },
    });
    if (userName) {
      await this.prisma.workflowComment.create({
        data: {
          taskId,
          userId,
          userName,
          text: `✅ Concluiu ${STAGES.find((s) => s.key === t.stage)?.label ?? t.stage}`,
        },
      });
    }
    return updated;
  }

  async blockTask(taskId: string, motivo: string, userId: string) {
    return this.prisma.workflowTask.update({
      where: { id: taskId },
      data: { status: 'bloqueada', blockedReason: motivo, analystId: userId },
    });
  }

  async assignTask(taskId: string, analystId: string) {
    const task = await this.prisma.workflowTask.update({
      where: { id: taskId },
      data: { analystId },
    });
    await this.prisma.notification.create({
      data: {
        companyId: task.companyId,
        userId: analystId,
        tipo: 'tarefa_atribuida',
        titulo: `Tarefa atribuída: ${STAGES.find((s) => s.key === task.stage)?.label}`,
        corpo: `Vencimento: ${new Date(task.slaDate).toLocaleDateString('pt-BR')}`,
        link: '/minha-carteira',
      },
    });
    return task;
  }

  async addComment(taskId: string, userId: string, userName: string, text: string, attachmentUrl?: string, attachmentName?: string) {
    // hash chain — pega o ultimo comentario para encadear
    const last = await this.prisma.workflowComment.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
    const prevHash = last?.hash ?? null;
    const payload = JSON.stringify({ taskId, userId, userName, text, attachmentUrl, prevHash, ts: new Date().toISOString() });
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    return this.prisma.workflowComment.create({
      data: { taskId, userId, userName, text, attachmentUrl, attachmentName, prevHash, hash },
    });
  }

  /**
   * Verifica integridade da cadeia de comentarios. Util para audit.
   */
  async verifyCommentChain(taskId: string) {
    const comments = await this.prisma.workflowComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    let prevHash: string | null = null;
    const broken: string[] = [];
    for (const c of comments) {
      if (c.prevHash !== prevHash) {
        broken.push(c.id);
      }
      prevHash = c.hash;
    }
    return { total: comments.length, broken, valid: broken.length === 0 };
  }

  async getComments(taskId: string) {
    return this.prisma.workflowComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── KPIs / Dashboard ───────────────────────────────────────

  async getKPIs(filter: { competencia?: string; analystId?: string } = {}) {
    const where: any = {};
    if (filter.competencia) where.competencia = filter.competencia;
    if (filter.analystId) where.analystId = filter.analystId;

    const tasks = await this.prisma.workflowTask.findMany({ where });
    const total = tasks.length;
    const concluidas = tasks.filter((t) => t.status === 'concluida').length;
    const emAndamento = tasks.filter((t) => t.status === 'em_andamento').length;
    const bloqueadas = tasks.filter((t) => t.status === 'bloqueada').length;
    const vencidas = tasks.filter((t) => t.status !== 'concluida' && new Date(t.slaDate) < new Date()).length;
    const noPrazo = tasks.filter((t) => {
      if (t.status !== 'concluida') return false;
      if (!t.completedAt) return false;
      return new Date(t.completedAt) <= new Date(t.slaDate);
    }).length;
    const pctSla = concluidas > 0 ? Math.round((noPrazo / concluidas) * 100) : 0;

    // gargalo: estagio com mais tasks abertas
    const porEstagio = STAGES.map((s) => {
      const list = tasks.filter((t) => t.stage === s.key && t.status !== 'concluida');
      return { stage: s.key, label: s.label, abertas: list.length };
    }).sort((a, b) => b.abertas - a.abertas);

    // tempo medio por estagio
    const temposPorEstagio = STAGES.map((s) => {
      const completas = tasks.filter((t) => t.stage === s.key && t.status === 'concluida' && t.tempoSegundos);
      const avg = completas.length > 0
        ? completas.reduce((sum, t) => sum + (t.tempoSegundos || 0), 0) / completas.length / 3600
        : 0;
      return { stage: s.key, label: s.label, horas: Math.round(avg * 10) / 10 };
    });

    return {
      total,
      concluidas,
      emAndamento,
      pendentes: total - concluidas - emAndamento - bloqueadas,
      bloqueadas,
      vencidas,
      noPrazo,
      pctSla,
      gargalo: porEstagio[0],
      porEstagio,
      temposPorEstagio,
    };
  }

  async getProducaoPorAnalista(competencia?: string) {
    const where: any = { analystId: { not: null } };
    if (competencia) where.competencia = competencia;
    const tasks = await this.prisma.workflowTask.findMany({ where });
    const grouped: Record<string, any> = {};
    for (const t of tasks) {
      const id = t.analystId!;
      if (!grouped[id]) {
        grouped[id] = {
          analystId: id,
          total: 0, concluidas: 0, emAndamento: 0, vencidas: 0, noPrazo: 0,
        };
      }
      grouped[id].total++;
      if (t.status === 'concluida') {
        grouped[id].concluidas++;
        if (t.completedAt && new Date(t.completedAt) <= new Date(t.slaDate)) {
          grouped[id].noPrazo++;
        }
      } else if (t.status === 'em_andamento') {
        grouped[id].emAndamento++;
      }
      if (t.status !== 'concluida' && new Date(t.slaDate) < new Date()) {
        grouped[id].vencidas++;
      }
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: Object.keys(grouped) } },
    });
    return Object.values(grouped).map((g: any) => ({
      ...g,
      analyst: users.find((u) => u.id === g.analystId),
      pctSla: g.concluidas > 0 ? Math.round((g.noPrazo / g.concluidas) * 100) : 0,
    }));
  }

  getStages() {
    return STAGES;
  }

  // ─── Stage config customizavel ──────────────────────────────

  async getStageConfig(companyId?: string) {
    const overrides = await this.prisma.workflowStageConfig.findMany({
      where: { OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])], active: true },
      orderBy: { ordem: 'asc' },
    });
    if (overrides.length === 0) {
      // retorna defaults
      return STAGES.map((s, i) => ({
        stageKey: s.key,
        label: s.label,
        slaDias: s.slaDias,
        ordem: i,
        color: s.color,
        active: true,
        scope: 'default' as const,
      }));
    }
    return overrides.map((o) => ({ ...o, scope: o.companyId ? 'company' : 'office' as const }));
  }

  async upsertStageConfig(stageKey: string, data: { label?: string; slaDias?: number; color?: string; ordem?: number; companyId?: string | null }) {
    const existing = await this.prisma.workflowStageConfig.findUnique({
      where: { companyId_stageKey: { companyId: data.companyId ?? null as any, stageKey } },
    }).catch(() => null);
    if (existing) {
      return this.prisma.workflowStageConfig.update({
        where: { id: existing.id },
        data: { label: data.label, slaDias: data.slaDias, color: data.color, ordem: data.ordem },
      });
    }
    const stage = STAGES.find((s) => s.key === stageKey);
    return this.prisma.workflowStageConfig.create({
      data: {
        companyId: data.companyId,
        stageKey,
        label: data.label ?? stage?.label ?? stageKey,
        slaDias: data.slaDias ?? stage?.slaDias ?? 3,
        color: data.color ?? stage?.color ?? '#6366f1',
        ordem: data.ordem ?? 0,
      },
    });
  }

  // ─── SLA Alerts (chamado via cron diario) ──────────────────

  async checkSlaAlerts() {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const tasks = await this.prisma.workflowTask.findMany({
      where: {
        status: { in: ['pendente', 'em_andamento'] },
        slaDate: { gte: tomorrow, lt: dayAfter },
        analystId: { not: null },
      },
    });

    let emailsSent = 0;
    for (const t of tasks) {
      const stage = STAGES.find((s) => s.key === t.stage);
      await this.prisma.notification.create({
        data: {
          companyId: t.companyId,
          userId: t.analystId!,
          tipo: 'sla_vencendo',
          titulo: `SLA amanhã: ${stage?.label ?? t.stage}`,
          corpo: `Vence em ${new Date(t.slaDate).toLocaleDateString('pt-BR')}`,
          link: '/minha-carteira',
        },
      });
      // envia e-mail
      const analyst = await this.prisma.user.findUnique({ where: { id: t.analystId! } });
      const company = await this.prisma.company.findUnique({ where: { id: t.companyId } });
      if (analyst?.email && company) {
        const r = await this.email.send(
          analyst.email,
          `[NexaContábil] SLA amanhã: ${stage?.label ?? t.stage}`,
          `<p>Olá <strong>${analyst.name}</strong>,</p>
           <p>A tarefa <strong>${stage?.label}</strong> da empresa <strong>${company.name}</strong>
           vence em <strong>${new Date(t.slaDate).toLocaleDateString('pt-BR')}</strong>.</p>
           <p><a href="https://frontend-production-2825.up.railway.app/minha-carteira">Abrir minha carteira</a></p>`,
        );
        if (r.ok) emailsSent++;
      }
    }
    return { alertados: tasks.length, emailsSent };
  }
}
