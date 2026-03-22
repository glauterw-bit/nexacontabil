import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateTransactionDto {
  companyId: string;
  documentId?: string;
  description: string;
  date: Date;
  entries: Array<{
    accountCode: string;
    accountName: string;
    nature: 'debit' | 'credit';
    value: number;
    costCenter?: string;
    description?: string;
  }>;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private _validate(entries: CreateTransactionDto['entries']) {
    const debit = entries.filter(e => e.nature === 'debit').reduce((s, e) => s + e.value, 0);
    const credit = entries.filter(e => e.nature === 'credit').reduce((s, e) => s + e.value, 0);
    return {
      totalDebit: debit,
      totalCredit: credit,
      isBalanced: Math.abs(debit - credit) < 0.01,
    };
  }

  async create(dto: CreateTransactionDto) {
    const { totalDebit, totalCredit, isBalanced } = this._validate(dto.entries);
    return this.prisma.transaction.create({
      data: {
        companyId: dto.companyId,
        documentId: dto.documentId,
        description: dto.description,
        date: dto.date,
        entries: dto.entries,
        totalDebit,
        totalCredit,
        isBalanced,
        status: 'draft',
      },
    });
  }

  async findAll(companyId: string, filters?: { status?: string; from?: Date; to?: Date }) {
    return this.prisma.transaction.findMany({
      where: {
        companyId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.from && { date: { gte: filters.from } }),
        ...(filters?.to && { date: { lte: filters.to } }),
      },
      orderBy: { date: 'desc' },
    });
  }

  async findById(id: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException(`Transação ${id} não encontrada`);
    return tx;
  }

  async approve(id: string, userId: string) {
    const tx = await this.findById(id);
    if (!tx.isBalanced) throw new BadRequestException('Transação desequilibrada não pode ser aprovada');
    return this.prisma.transaction.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId, approvedAt: new Date() },
    });
  }

  async reject(id: string, reason: string) {
    await this.findById(id);
    return this.prisma.transaction.update({
      where: { id },
      data: { status: 'rejected', aiReasoning: reason },
    });
  }

  async getStats(companyId: string) {
    const [total, pending, approved] = await Promise.all([
      this.prisma.transaction.count({ where: { companyId } }),
      this.prisma.transaction.count({ where: { companyId, status: 'pending_review' } }),
      this.prisma.transaction.count({ where: { companyId, status: 'approved' } }),
    ]);
    const totals = await this.prisma.transaction.aggregate({
      where: { companyId, status: 'approved' },
      _sum: { totalDebit: true },
    });
    return { total, pending, approved, totalApprovedValue: totals._sum.totalDebit ?? 0 };
  }
}
