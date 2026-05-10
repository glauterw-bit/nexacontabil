import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface FiscalNoteItem {
  description: string;
  quantity: number;
  unitValue: number;
  ncm?: string;
  cfop?: string;
}

export interface CreateFiscalNoteDto {
  companyId: string;
  type: string;
  recipientName: string;
  recipientCnpjCpf: string;
  recipientEmail?: string;
  items: FiscalNoteItem[];
  totalValue: number;
}

@Injectable()
export class FiscalNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFiscalNoteDto) {
    return this.prisma.fiscalNote.create({
      data: {
        companyId: dto.companyId,
        type: dto.type,
        recipientName: dto.recipientName,
        recipientCnpjCpf: dto.recipientCnpjCpf,
        recipientEmail: dto.recipientEmail,
        items: JSON.stringify(dto.items),
        totalValue: dto.totalValue,
        status: 'draft',
      },
    });
  }

  async findAll(companyId: string, status?: string) {
    return this.prisma.fiscalNote.findMany({
      where: {
        companyId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const note = await this.prisma.fiscalNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException(`Nota fiscal ${id} não encontrada`);
    return note;
  }

  /**
   * Stub para emissão na SEFAZ.
   * Marca a nota como "authorized" e gera chave de acesso e protocolo fictícios.
   * Em produção, esta função integraria com a API da SEFAZ via certificado digital A1.
   */
  async sendFiscalNote(id: string) {
    const note = await this.findById(id);

    // Stub: gera chave de acesso de 44 dígitos e protocolo
    const accessKey = Array.from({ length: 44 }, () =>
      Math.floor(Math.random() * 10),
    ).join('');
    const protocolNumber = `${Date.now()}`;
    const noteNumber = Math.floor(Math.random() * 900000) + 100000;

    return this.prisma.fiscalNote.update({
      where: { id },
      data: {
        status: 'authorized',
        accessKey,
        protocolNumber,
        number: noteNumber,
        issueDate: new Date(),
        // Scaffold: em produção salvar XML retornado pela SEFAZ
        xmlContent: JSON.stringify({
          stub: true,
          message: 'Integração SEFAZ pendente de certificado digital A1',
          accessKey,
          protocolNumber,
          noteNumber,
          issuedAt: new Date().toISOString(),
        }),
      },
    });
  }

  async cancelFiscalNote(id: string, reason: string) {
    await this.findById(id);
    return this.prisma.fiscalNote.update({
      where: { id },
      data: {
        status: 'cancelled',
        rejectionMessage: reason,
      },
    });
  }
}
