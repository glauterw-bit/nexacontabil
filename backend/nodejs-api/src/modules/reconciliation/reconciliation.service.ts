import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async runReconciliation(
    companyId: string,
    sources: Array<{ id: string; descricao: string; valor: number; data: string }>,
    targets: Array<{ id: string; descricao: string; valor: number; data: string }>,
    matchType: string,
  ) {
    const result = await this.ai.reconciliarTransacoes(sources, targets, matchType);

    await this.prisma.reconciliationRun.create({
      data: {
        companyId,
        matchType,
        status: 'completed',
        matchesCount: result.matches.length,
        unmatchedCount: result.unmatchedSources.length + result.unmatchedTargets.length,
        totalMatchedValue: result.totalMatchedValue,
        totalUnmatchedValue: result.totalUnmatchedValue,
        matches: result as any,
      },
    });

    return result;
  }

  async getHistory(companyId: string) {
    return this.prisma.reconciliationRun.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
