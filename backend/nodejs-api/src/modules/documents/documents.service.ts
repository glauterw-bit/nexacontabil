import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async findAll(companyId: string, filters?: { type?: string; status?: string }) {
    return this.prisma.document.findMany({
      where: {
        companyId,
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Documento ${id} não encontrado`);
    return doc;
  }

  // ─── Processar documento com Claude Vision (OCR + extração fiscal) ─────────

  async processarComIA(
    companyId: string,
    base64Content: string,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' = 'image/jpeg',
  ) {
    const startedAt = Date.now();

    const extracted = await this.ai.processarDocumento(base64Content, mediaType);

    const doc = await this.prisma.document.create({
      data: {
        companyId,
        type: extracted.tipo ?? 'outro',
        status: extracted.confidence > 0.6 ? 'completed' : 'needs_review',
        confidenceScore: extracted.confidence,
        extractedData: extracted as any,
        number: extracted.numero ?? null,
        issueDate: extracted.dataEmissao
          ? new Date(extracted.dataEmissao.split('/').reverse().join('-'))
          : null,
        dueDate: extracted.dataVencimento
          ? new Date(extracted.dataVencimento.split('/').reverse().join('-'))
          : null,
        totalValue: extracted.valorTotal ?? null,
        issuerName: extracted.emitenteNome ?? null,
        issuerCnpj: extracted.emitenteCnpj ?? null,
        fiscalValidation: { chaveAcesso: extracted.chaveAcesso, impostos: extracted.impostos } as any,
        agentDecisions: extracted.sugestoesContabeis as any,
        processingTimeMs: Date.now() - startedAt,
      },
    });

    return doc;
  }

  // ─── Processar XML fiscal com Claude ──────────────────────────────────────

  async processarXmlComIA(companyId: string, xmlContent: string) {
    const startedAt = Date.now();
    const extracted = await this.ai.analisarXmlFiscal(xmlContent);

    return this.prisma.document.create({
      data: {
        companyId,
        type: extracted.tipo ?? 'nfe',
        status: 'completed',
        confidenceScore: extracted.confidence,
        extractedData: extracted as any,
        number: extracted.numero ?? null,
        issueDate: extracted.dataEmissao
          ? new Date(extracted.dataEmissao.split('/').reverse().join('-'))
          : null,
        totalValue: extracted.valorTotal ?? null,
        issuerName: extracted.emitenteNome ?? null,
        issuerCnpj: extracted.emitenteCnpj ?? null,
        agentDecisions: extracted.sugestoesContabeis as any,
        processingTimeMs: Date.now() - startedAt,
      },
    });
  }

  async saveProcessingResult(companyId: string, result: any, _source?: string) {
    return this.prisma.document.create({
      data: {
        companyId,
        type: result.extracted_data?.document_type || 'other',
        status: result.status || 'completed',
        confidenceScore: result.extracted_data?.confidence_score,
        extractedData: result.extracted_data,
        number: result.extracted_data?.number,
        issueDate: result.extracted_data?.issue_date
          ? new Date(result.extracted_data.issue_date.split('/').reverse().join('-'))
          : null,
        dueDate: result.extracted_data?.due_date
          ? new Date(result.extracted_data.due_date.split('/').reverse().join('-'))
          : null,
        totalValue: result.extracted_data?.total_value,
        issuerName: result.extracted_data?.issuer_name,
        issuerCnpj: result.extracted_data?.issuer_cnpj,
        fiscalValidation: result.fiscal_validation,
        agentDecisions: result.accounting_suggestions,
        processingTimeMs: result.processing_time_ms,
      },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.document.update({ where: { id }, data: { status } });
  }

  async getPendingDocuments(companyId: string) {
    return this.prisma.document.findMany({
      where: { companyId, status: { in: ['pending', 'needs_review'] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStats(companyId: string) {
    const [total, pending, completed, failed] = await Promise.all([
      this.prisma.document.count({ where: { companyId } }),
      this.prisma.document.count({ where: { companyId, status: 'pending' } }),
      this.prisma.document.count({ where: { companyId, status: 'completed' } }),
      this.prisma.document.count({ where: { companyId, status: 'failed' } }),
    ]);
    const totalValue = await this.prisma.document.aggregate({
      where: { companyId, status: 'completed' },
      _sum: { totalValue: true },
    });
    return { total, pending, completed, failed, totalValue: totalValue._sum.totalValue ?? 0 };
  }
}
