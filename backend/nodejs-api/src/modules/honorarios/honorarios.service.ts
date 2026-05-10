import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class HonorariosService {
  constructor(private prisma: PrismaService) {}

  async listar(companyId: string) {
    return this.prisma.honorario.findMany({
      where: { companyId },
      orderBy: [{ status: 'asc' }, { vencimento: 'asc' }],
    });
  }

  async criar(companyId: string, data: {
    descricao: string;
    competencia: string;
    valor: number;
    vencimento: Date;
    formaPagamento?: string;
    observacao?: string;
  }) {
    return this.prisma.honorario.create({
      data: { companyId, ...data },
    });
  }

  async registrarPagamento(id: string) {
    return this.prisma.honorario.update({
      where: { id },
      data: { status: 'pago', paidAt: new Date() },
    });
  }

  async cancelar(id: string) {
    return this.prisma.honorario.update({
      where: { id },
      data: { status: 'cancelado' },
    });
  }

  async resumo(companyId: string) {
    const todos = await this.prisma.honorario.findMany({ where: { companyId } });
    const totalPendente = todos.filter(h => h.status === 'pendente').reduce((s, h) => s + h.valor, 0);
    const totalPago = todos.filter(h => h.status === 'pago').reduce((s, h) => s + h.valor, 0);
    const totalAtrasado = todos.filter(h => h.status === 'atrasado').reduce((s, h) => s + h.valor, 0);
    const vencendoHoje = todos.filter(h => {
      if (h.status !== 'pendente') return false;
      const hoje = new Date();
      const venc = new Date(h.vencimento);
      return venc.toDateString() === hoje.toDateString();
    }).length;
    return { totalPendente, totalPago, totalAtrasado, vencendoHoje, quantidade: todos.length };
  }

  async verificarAtrasados(companyId: string) {
    const hoje = new Date();
    const atrasados = await this.prisma.honorario.findMany({
      where: { companyId, status: 'pendente', vencimento: { lt: hoje } },
    });
    for (const h of atrasados) {
      await this.prisma.honorario.update({ where: { id: h.id }, data: { status: 'atrasado' } });
    }
    return { atualizados: atrasados.length };
  }

  async gerarMensalidade(companyId: string, competencia: string, valor: number) {
    const [ano, mes] = competencia.split('-').map(Number);
    const vencimento = new Date(ano, mes - 1 + 1, 10); // dia 10 do mês seguinte
    return this.prisma.honorario.create({
      data: {
        companyId,
        descricao: `Honorários contábeis - ${competencia}`,
        competencia,
        valor,
        vencimento,
        formaPagamento: 'boleto',
      },
    });
  }
}
