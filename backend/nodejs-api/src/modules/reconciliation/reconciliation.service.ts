import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import axios from 'axios';

@Injectable()
export class ReconciliationService {
  private readonly aiUrl = process.env.PYTHON_AI_URL || 'http://localhost:8000';

  constructor(private readonly prisma: PrismaService) {}

  async runReconciliation(companyId: string, sources: any[], targets: any[], matchType: string) {
    const response = await axios.post(`${this.aiUrl}/api/v1/transactions/reconcile`, {
      company_id: companyId,
      sources,
      targets,
      match_type: matchType,
    });

    const result = response.data;

    await this.prisma.reconciliationRun.create({
      data: {
        companyId,
        matchType,
        status: 'completed',
        matchesCount: result.matches?.length ?? 0,
        unmatchedCount: (result.unmatched_sources?.length ?? 0) + (result.unmatched_targets?.length ?? 0),
        totalMatchedValue: result.total_matched_value ?? 0,
        totalUnmatchedValue: result.total_unmatched_value ?? 0,
        matches: result,
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
