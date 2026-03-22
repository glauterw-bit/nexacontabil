import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export interface AuditEntry {
  companyId: string;
  transactionId?: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  agentType?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private async _getLastHash(companyId: string): Promise<string> {
    const last = await this.prisma.auditTrail.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { currentHash: true },
    });
    return last?.currentHash ?? '0000000000000000';
  }

  private _computeHash(entry: AuditEntry, previousHash: string, timestamp: Date): string {
    const payload = JSON.stringify({ ...entry, previousHash, timestamp: timestamp.toISOString() });
    return createHash('sha256').update(payload).digest('hex');
  }

  async record(entry: AuditEntry): Promise<void> {
    const previousHash = await this._getLastHash(entry.companyId);
    const timestamp = new Date();
    const currentHash = this._computeHash(entry, previousHash, timestamp);

    await this.prisma.auditTrail.create({
      data: {
        companyId: entry.companyId,
        transactionId: entry.transactionId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        performedBy: entry.performedBy,
        agentType: entry.agentType,
        oldValues: entry.oldValues,
        newValues: entry.newValues,
        metadata: entry.metadata,
        previousHash,
        currentHash,
      },
    });
  }

  async getTrail(companyId: string, filters?: { entityType?: string; from?: Date; to?: Date }) {
    return this.prisma.auditTrail.findMany({
      where: {
        companyId,
        ...(filters?.entityType && { entityType: filters.entityType }),
        ...(filters?.from && { createdAt: { gte: filters.from } }),
        ...(filters?.to && { createdAt: { lte: filters.to } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async verifyIntegrity(companyId: string): Promise<{ valid: boolean; invalidEntries: string[] }> {
    const trail = await this.prisma.auditTrail.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    });

    const invalid: string[] = [];
    let prevHash = '0000000000000000';

    for (const entry of trail) {
      if (entry.previousHash !== prevHash) {
        invalid.push(entry.id);
      }
      prevHash = entry.currentHash;
    }

    return { valid: invalid.length === 0, invalidEntries: invalid };
  }
}
