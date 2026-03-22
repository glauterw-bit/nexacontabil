import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import axios from 'axios';

@Injectable()
export class DocumentsService {
  private readonly aiUrl = process.env.PYTHON_AI_URL || 'http://localhost:8000';

  constructor(private readonly prisma: PrismaService) {}

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

  async saveProcessingResult(companyId: string, result: any) {
    return this.prisma.document.create({
      data: {
        companyId,
        type: result.extracted_data?.document_type || 'other',
        status: result.status,
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
        complianceCheck: result.compliance_check,
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

    return {
      total,
      pending,
      completed,
      failed,
      totalValue: totalValue._sum.totalValue ?? 0,
    };
  }
}
