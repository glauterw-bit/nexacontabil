import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LgpdService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria uma requisicao do titular de dados (LGPD art. 18).
   * Tipos: export | delete | rectify | object
   */
  async create(data: {
    userEmail: string;
    tipo: 'export' | 'delete' | 'rectify' | 'object';
    motivo?: string;
    companyId?: string;
    ipSolicitante?: string;
  }) {
    return this.prisma.dataSubjectRequest.create({ data });
  }

  list(status?: string) {
    return this.prisma.dataSubjectRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Exporta dados pessoais do titular em formato portavel (JSON).
   * Inclui dados de User, Employee (se aplicavel) e referencias contabeis.
   * Retem dados com base legal (5 anos obrigacao fiscal) — apenas marca o que foi exportado.
   */
  async executeExport(id: string) {
    const req = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.tipo !== 'export') throw new Error('Requisicao nao eh de export');

    const user = await this.prisma.user.findUnique({ where: { email: req.userEmail } });
    // Employee nao possui email; busca por User > Employee em nome se necessario
    const employees = user
      ? await this.prisma.employee.findMany({ where: { name: user.name } })
      : [];

    const portableData = {
      titular: req.userEmail,
      geradoEm: new Date().toISOString(),
      dadosPessoais: user
        ? { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt }
        : null,
      dadosTrabalhistas: employees.map((e) => ({
        cpf: e.cpf,
        nome: e.name,
        cargo: e.role,
        admissao: e.admissionDate,
        demissao: e.dismissalDate,
      })),
      observacaoBaseLegal:
        'Dados fiscais e trabalhistas sao mantidos por 5 anos conforme exigencia legal (art. 173 CTN, art. 23 LCP, IN RFB). LGPD art. 16 II.',
    };

    return this.prisma.dataSubjectRequest.update({
      where: { id },
      data: {
        status: 'atendida',
        atendidaEm: new Date(),
        arquivoUrl: 'data:application/json;base64,' + Buffer.from(JSON.stringify(portableData, null, 2)).toString('base64'),
      },
    });
  }

  /**
   * Atende uma requisicao de exclusao.
   * Anonimiza dados pessoais mantendo o registro contabil (obrigacao fiscal 5 anos).
   */
  async executeDelete(id: string, legalBasis?: string) {
    const req = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException();
    if (req.tipo !== 'delete') throw new Error('Requisicao nao eh de delete');

    const user = await this.prisma.user.findUnique({ where: { email: req.userEmail } });
    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: `anon-${user.id.slice(0, 8)}@anon.local`,
          name: 'Titular anonimizado',
          password: 'ANONYMIZED',
          active: false,
          totpSecret: null,
        },
      });
    }
    return this.prisma.dataSubjectRequest.update({
      where: { id },
      data: {
        status: 'atendida',
        atendidaEm: new Date(),
        legalBasis: legalBasis ?? 'Anonimizacao aplicada; dados contabeis retidos por obrigacao legal (5 anos).',
      },
    });
  }

  async reject(id: string, motivo: string) {
    return this.prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: 'rejeitada', legalBasis: motivo, atendidaEm: new Date() },
    });
  }
}
