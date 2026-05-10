import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async listar(companyId: string, userId?: string) {
    return this.prisma.notification.findMany({
      where: { companyId, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async naoLidas(companyId: string) {
    return this.prisma.notification.count({
      where: { companyId, lida: false },
    });
  }

  async marcarLida(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { lida: true, lidaEm: new Date() },
    });
  }

  async marcarTodasLidas(companyId: string) {
    await this.prisma.notification.updateMany({
      where: { companyId, lida: false },
      data: { lida: true, lidaEm: new Date() },
    });
    return { success: true };
  }

  async criar(data: {
    companyId: string;
    userId?: string;
    tipo: string;
    titulo: string;
    corpo: string;
    link?: string;
  }) {
    return this.prisma.notification.create({ data });
  }

  async gerarAlertas(companyId: string) {
    const hoje = new Date();
    const em7dias = new Date(hoje);
    em7dias.setDate(hoje.getDate() + 7);
    const notificacoes: any[] = [];

    // Obrigações vencendo
    const obrigacoes = await this.prisma.fiscalObligation.findMany({
      where: { companyId, status: 'pending', dueDate: { gte: hoje, lte: em7dias } },
    });
    for (const o of obrigacoes) {
      const diasRestantes = Math.ceil((new Date(o.dueDate).getTime() - hoje.getTime()) / 86400000);
      notificacoes.push(await this.criar({
        companyId,
        tipo: 'obrigacao_vencendo',
        titulo: `Obrigação vence em ${diasRestantes} dia(s)`,
        corpo: `${o.name} - vence em ${new Date(o.dueDate).toLocaleDateString('pt-BR')}`,
        link: '/agenda',
      }));
    }

    // Certidões vencendo
    const certidoes = await this.prisma.certidao.findMany({
      where: { companyId, dataValidade: { gte: hoje, lte: em7dias } },
    });
    for (const c of certidoes) {
      notificacoes.push(await this.criar({
        companyId,
        tipo: 'certidao_vencendo',
        titulo: `Certidão ${c.tipo} vence em breve`,
        corpo: `${c.orgao} - válida até ${new Date(c.dataValidade!).toLocaleDateString('pt-BR')}`,
        link: '/certidoes',
      }));
    }

    // Honorários atrasados
    const honorarios = await this.prisma.honorario.findMany({
      where: { companyId, status: 'atrasado' },
    });
    for (const h of honorarios) {
      notificacoes.push(await this.criar({
        companyId,
        tipo: 'honorario_vencendo',
        titulo: 'Honorário em atraso',
        corpo: `${h.descricao} - ${h.competencia} - R$ ${h.valor.toFixed(2)}`,
        link: '/honorarios',
      }));
    }

    return { criadas: notificacoes.length };
  }
}
