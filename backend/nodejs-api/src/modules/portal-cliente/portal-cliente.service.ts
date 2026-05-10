import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class PortalClienteService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async criarPortal(companyId: string, dados: {
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
  }) {
    const accessToken = crypto.randomBytes(32).toString('hex');

    // ClientPortal has companyId @unique — upsert
    const portal = await this.prisma.clientPortal.upsert({
      where: { companyId },
      create: {
        companyId,
        accessToken,
        clientName: dados.clientName,
        clientEmail: dados.clientEmail,
        clientPhone: dados.clientPhone,
        active: true,
        documentsEnabled: true,
        reportsEnabled: true,
        obligationsEnabled: true,
        chatEnabled: true,
      },
      update: {
        clientName: dados.clientName,
        clientEmail: dados.clientEmail,
        clientPhone: dados.clientPhone,
        active: true,
      },
    });

    const portalUrl = this.config.get('NEXT_PUBLIC_PORTAL_URL') || 'http://localhost:3010/portal';
    const linkAcesso = `${portalUrl}/${portal.accessToken}`;

    return { ...portal, linkAcesso };
  }

  async loginPortal(accessToken: string) {
    const portal = await this.prisma.clientPortal.findUnique({
      where: { accessToken },
      include: { company: { select: { name: true } } },
    });

    if (!portal || !portal.active) throw new UnauthorizedException('Portal não encontrado ou inativo');

    const jwtSecret = this.config.get('PORTAL_JWT_SECRET') || 'portal-secret';
    const token = jwt.sign(
      { portalId: portal.id, companyId: portal.companyId },
      jwtSecret,
      { expiresIn: '24h' },
    );

    await this.prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastAccessAt: new Date() },
    });

    return { token, portal };
  }

  async listarDocumentosPortal(portalId: string) {
    const portal = await this.prisma.clientPortal.findUnique({ where: { id: portalId } });
    if (!portal) throw new NotFoundException('Portal não encontrado');

    return this.prisma.document.findMany({
      where: { companyId: portal.companyId },
      select: { id: true, originalFilename: true, type: true, createdAt: true, fileUrl: true, totalValue: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async enviarMensagem(portalId: string, conteudo: string) {
    return this.prisma.portalMessage.create({
      data: {
        portalId,
        sender: 'cliente',
        message: conteudo,
      },
    });
  }

  async listarMensagens(portalId: string) {
    return this.prisma.portalMessage.findMany({
      where: { portalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async responderMensagem(mensagemId: string, resposta: string, portalId: string) {
    await this.prisma.portalMessage.update({
      where: { id: mensagemId },
      data: { readAt: new Date() },
    });

    return this.prisma.portalMessage.create({
      data: {
        portalId,
        sender: 'contador',
        message: resposta,
      },
    });
  }

  async listarObrigacoes(portalId: string) {
    const portal = await this.prisma.clientPortal.findUnique({ where: { id: portalId } });
    if (!portal) throw new NotFoundException('Portal não encontrado');

    return this.prisma.fiscalObligation.findMany({
      where: { companyId: portal.companyId, dueDate: { gte: new Date() } },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });
  }

  async listarPortais(companyId: string) {
    return this.prisma.clientPortal.findMany({
      where: { companyId },
      select: {
        id: true, clientName: true, clientEmail: true, active: true,
        lastAccessAt: true, createdAt: true,
      },
    });
  }
}
