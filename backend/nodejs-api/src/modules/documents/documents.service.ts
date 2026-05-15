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
        extractedData: JSON.stringify(extracted),
        number: extracted.numero ?? null,
        issueDate: this.parseBrDate(extracted.dataEmissao),
        dueDate: this.parseBrDate(extracted.dataVencimento),
        totalValue: extracted.valorTotal ?? null,
        issuerName: extracted.emitenteNome ?? null,
        issuerCnpj: extracted.emitenteCnpj ?? null,
        fiscalValidation: JSON.stringify({ chaveAcesso: extracted.chaveAcesso, impostos: extracted.impostos }),
        agentDecisions: JSON.stringify(extracted.sugestoesContabeis ?? []),
        processingTimeMs: Date.now() - startedAt,
      },
    });

    return doc;
  }

  private parseBrDate(v?: string | null): Date | null {
    if (!v) return null;
    // Aceita DD/MM/AAAA ou YYYY-MM-DD
    try {
      if (v.includes('/')) {
        const [d, m, y] = v.split('/');
        if (d && m && y) return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
      }
      const dt = new Date(v);
      return isNaN(dt.getTime()) ? null : dt;
    } catch {
      return null;
    }
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
        extractedData: JSON.stringify(extracted),
        number: extracted.numero ?? null,
        issueDate: this.parseBrDate(extracted.dataEmissao),
        totalValue: extracted.valorTotal ?? null,
        issuerName: extracted.emitenteNome ?? null,
        issuerCnpj: extracted.emitenteCnpj ?? null,
        agentDecisions: JSON.stringify(extracted.sugestoesContabeis ?? []),
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
        extractedData: result.extracted_data ? JSON.stringify(result.extracted_data) : null,
        number: result.extracted_data?.number,
        issueDate: this.parseBrDate(result.extracted_data?.issue_date),
        dueDate: this.parseBrDate(result.extracted_data?.due_date),
        totalValue: result.extracted_data?.total_value,
        issuerName: result.extracted_data?.issuer_name,
        issuerCnpj: result.extracted_data?.issuer_cnpj,
        fiscalValidation: result.fiscal_validation ? JSON.stringify(result.fiscal_validation) : null,
        agentDecisions: result.accounting_suggestions ? JSON.stringify(result.accounting_suggestions) : null,
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
