import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class DashboardEscritorioService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(companyId: string) {
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const em7Dias = new Date(hoje);
    em7Dias.setDate(hoje.getDate() + 7);

    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);

    // ── Tarefas ───────────────────────────────────────────────
    const tarefas = await this.prisma.tarefa.findMany({
      where: { companyId },
    });

    const tarefasPendentes = tarefas.filter(t => t.status === 'a_fazer' || t.status === 'backlog');
    const tarefasEmAndamento = tarefas.filter(t => t.status === 'em_andamento');
    const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida');
    const tarefasAtrasadas = tarefas.filter(
      t =>
        t.prazo &&
        new Date(t.prazo) < hoje &&
        t.status !== 'concluida' &&
        t.status !== 'cancelada',
    );

    // Agrupamento por responsável
    const porColaboradorMap: Record<string, number> = {};
    for (const t of tarefas) {
      const resp = t.responsavel || 'Sem responsável';
      porColaboradorMap[resp] = (porColaboradorMap[resp] || 0) + 1;
    }
    const porColaborador = Object.entries(porColaboradorMap).map(([nome, total]) => ({
      nome,
      total,
    }));

    // ── Clientes ──────────────────────────────────────────────
    const empresas = await this.prisma.company.findMany({
      select: { id: true, active: true },
    });

    const totalEmpresas = empresas.length;
    const ativas = empresas.filter(e => e.active).length;

    // Clientes inadimplentes: têm boleto vencido e não pago
    const boletosVencidos = await this.prisma.boleto.findMany({
      where: {
        status: 'pending',
        dueDate: { lt: hoje },
      },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    const inadimplentes = boletosVencidos.length;

    // ── Financeiro (Honorários) ───────────────────────────────
    const honorariosMes = await this.prisma.honorario.findMany({
      where: {
        companyId,
        vencimento: { gte: inicioMes, lte: fimMes },
      },
    });

    const honorariosMesTotal = honorariosMes
      .filter(h => h.status !== 'cancelado')
      .reduce((s, h) => s + h.valor, 0);

    const honorariosAtrasoTotal = honorariosMes
      .filter(h => h.status === 'atrasado')
      .reduce((s, h) => s + h.valor, 0);

    // Ticket médio: média dos honorários ativos
    const todosHonorarios = await this.prisma.honorario.findMany({
      where: {
        companyId,
        status: { not: 'cancelado' },
      },
      select: { valor: true },
    });
    const ticketMedio =
      todosHonorarios.length > 0
        ? todosHonorarios.reduce((s, h) => s + h.valor, 0) / todosHonorarios.length
        : 0;

    // ── Obrigações Fiscais ────────────────────────────────────
    const obrigacoes = await this.prisma.fiscalObligation.findMany({
      where: { companyId },
    });

    const vencendoHoje = obrigacoes.filter(o => {
      const prazo = new Date(o.dueDate);
      prazo.setHours(0, 0, 0, 0);
      return prazo.getTime() === hoje.getTime() && o.status === 'pending';
    }).length;

    const vencendo7Dias = obrigacoes.filter(o => {
      const prazo = new Date(o.dueDate);
      prazo.setHours(0, 0, 0, 0);
      return prazo >= hoje && prazo <= em7Dias && o.status === 'pending';
    }).length;

    const obrigacoesAtrasadas = obrigacoes.filter(
      o => new Date(o.dueDate) < hoje && o.status === 'pending',
    ).length;

    return {
      tarefas: {
        total: tarefas.length,
        pendentes: tarefasPendentes.length,
        emAndamento: tarefasEmAndamento.length,
        concluidas: tarefasConcluidas.length,
        atrasadas: tarefasAtrasadas.length,
        porColaborador,
      },
      clientes: {
        total: totalEmpresas,
        ativas,
        inadimplentes,
      },
      financeiro: {
        honorariosMes: parseFloat(honorariosMesTotal.toFixed(2)),
        honorariosAtraso: parseFloat(honorariosAtrasoTotal.toFixed(2)),
        ticketMedio: parseFloat(ticketMedio.toFixed(2)),
      },
      obrigacoes: {
        vencendoHoje,
        vencendo7Dias,
        atrasadas: obrigacoesAtrasadas,
      },
    };
  }
}
