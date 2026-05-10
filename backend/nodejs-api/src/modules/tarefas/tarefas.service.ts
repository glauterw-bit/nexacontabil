import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TarefasService {
  constructor(private prisma: PrismaService) {}

  async listarKanban(companyId: string) {
    const tarefas = await this.prisma.tarefa.findMany({
      where: { companyId },
      orderBy: [{ prioridade: 'desc' }, { prazo: 'asc' }],
    });

    const colunas = ['backlog', 'a_fazer', 'em_andamento', 'revisao', 'concluida'];
    return colunas.map(status => ({
      status,
      label: {
        backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em Andamento',
        revisao: 'Revisão', concluida: 'Concluída',
      }[status] || status,
      tarefas: tarefas.filter(t => t.status === status),
    }));
  }

  async criar(companyId: string, data: {
    titulo: string;
    descricao?: string;
    tipo?: string;
    status?: string;
    prioridade?: string;
    responsavel?: string;
    prazo?: Date;
    tags?: string;
    checklist?: string;
  }) {
    return this.prisma.tarefa.create({ data: { companyId, ...data } });
  }

  async moverColuna(id: string, novoStatus: string) {
    const data: any = { status: novoStatus };
    if (novoStatus === 'concluida') data.concluidaEm = new Date();
    return this.prisma.tarefa.update({ where: { id }, data });
  }

  async atualizar(id: string, data: Partial<{
    titulo: string; descricao: string; prioridade: string;
    responsavel: string; prazo: Date; checklist: string; tags: string;
  }>) {
    return this.prisma.tarefa.update({ where: { id }, data });
  }

  async deletar(id: string) {
    await this.prisma.tarefa.delete({ where: { id } });
    return { success: true };
  }

  async vencendoHoje(companyId: string) {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    return this.prisma.tarefa.findMany({
      where: {
        companyId,
        status: { notIn: ['concluida', 'cancelada'] },
        prazo: { gte: hoje, lt: amanha },
      },
    });
  }

  async resumo(companyId: string) {
    const todas = await this.prisma.tarefa.findMany({ where: { companyId } });
    return {
      total: todas.length,
      backlog: todas.filter(t => t.status === 'backlog').length,
      emAndamento: todas.filter(t => t.status === 'em_andamento').length,
      concluidas: todas.filter(t => t.status === 'concluida').length,
      atrasadas: todas.filter(t => {
        if (!t.prazo || ['concluida', 'cancelada'].includes(t.status)) return false;
        return new Date(t.prazo) < new Date();
      }).length,
    };
  }
}
