import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ComunicadosService {
  constructor(private prisma: PrismaService) {}

  async listar(escritorioId: string) {
    return this.prisma.comunicado.findMany({
      where: { escritorioId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async criar(escritorioId: string, data: {
    titulo: string;
    corpo: string;
    tipo?: string;
    canal?: string;
    destinatarios?: string;
    agendadoPara?: Date;
  }) {
    return this.prisma.comunicado.create({
      data: { escritorioId, ...data },
    });
  }

  async enviar(id: string) {
    const comunicado = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!comunicado) throw new Error('Comunicado não encontrado');

    // Conta destinatários
    let totalEnviados = 0;
    if (comunicado.destinatarios === 'todos') {
      totalEnviados = await this.prisma.company.count({ where: { active: true } });
    } else {
      try {
        const ids = JSON.parse(comunicado.destinatarios);
        totalEnviados = Array.isArray(ids) ? ids.length : 1;
      } catch { totalEnviados = 1; }
    }

    return this.prisma.comunicado.update({
      where: { id },
      data: { status: 'enviado', enviadoEm: new Date(), totalEnviados },
    });
  }

  async marcarLido(id: string) {
    const c = await this.prisma.comunicado.findUnique({ where: { id } });
    if (!c) throw new Error('Comunicado não encontrado');
    return this.prisma.comunicado.update({
      where: { id },
      data: { lidos: c.lidos + 1 },
    });
  }

  async cancelar(id: string) {
    return this.prisma.comunicado.update({
      where: { id },
      data: { status: 'cancelado' },
    });
  }

  async deletar(id: string) {
    await this.prisma.comunicado.delete({ where: { id } });
    return { success: true };
  }

  async resumo(escritorioId: string) {
    const todos = await this.prisma.comunicado.findMany({ where: { escritorioId } });
    return {
      total: todos.length,
      enviados: todos.filter(c => c.status === 'enviado').length,
      rascunhos: todos.filter(c => c.status === 'rascunho').length,
      agendados: todos.filter(c => c.status === 'agendado').length,
      totalAlcancados: todos.reduce((s, c) => s + c.totalEnviados, 0),
    };
  }
}
