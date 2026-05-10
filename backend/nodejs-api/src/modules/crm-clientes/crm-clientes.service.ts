import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CrmClientesService {
  constructor(private prisma: PrismaService) {}

  async listarPipeline(companyId: string) {
    const clientes = await this.prisma.crmCliente.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });

    const stages = ['lead', 'qualificado', 'proposta', 'negociacao', 'cliente', 'perdido'];
    const pipeline = stages.map(stage => ({
      stage,
      clientes: clientes.filter(c => c.stage === stage),
      total: clientes.filter(c => c.stage === stage).reduce((s, c) => s + (c.valorEstimado || 0), 0),
    }));

    return { pipeline, total: clientes.length };
  }

  async criar(companyId: string, data: {
    nome: string;
    cnpjCpf?: string;
    email?: string;
    telefone?: string;
    segmento?: string;
    origem?: string;
    stage?: string;
    valorEstimado?: number;
    probabilidade?: number;
    responsavel?: string;
    observacoes?: string;
    tags?: string;
  }) {
    return this.prisma.crmCliente.create({ data: { companyId, ...data } });
  }

  async avancarStage(id: string, novoStage: string) {
    return this.prisma.crmCliente.update({
      where: { id },
      data: { stage: novoStage, ultimoContato: new Date() },
    });
  }

  async registrarContato(id: string, proximoContato?: Date) {
    return this.prisma.crmCliente.update({
      where: { id },
      data: { ultimoContato: new Date(), proximoContato },
    });
  }

  async atualizar(id: string, data: Partial<{
    nome: string; email: string; telefone: string; segmento: string;
    valorEstimado: number; probabilidade: number; observacoes: string;
    tags: string; responsavel: string; proximoContato: Date;
  }>) {
    return this.prisma.crmCliente.update({ where: { id }, data });
  }

  async deletar(id: string) {
    await this.prisma.crmCliente.delete({ where: { id } });
    return { success: true };
  }

  async metricas(companyId: string) {
    const todos = await this.prisma.crmCliente.findMany({ where: { companyId } });
    const clientes = todos.filter(c => c.stage === 'cliente');
    const leads = todos.filter(c => c.stage === 'lead');
    const receita = clientes.reduce((s, c) => s + (c.valorEstimado || 0), 0);
    const pipeline = todos.filter(c => !['cliente', 'perdido'].includes(c.stage))
      .reduce((s, c) => s + (c.valorEstimado || 0) * ((c.probabilidade || 50) / 100), 0);

    return {
      totalLeads: leads.length,
      totalClientes: clientes.length,
      taxaConversao: todos.length > 0 ? (clientes.length / todos.length * 100).toFixed(1) : '0',
      receitaMensalEstimada: receita,
      pipelineEstimado: pipeline,
    };
  }
}
