import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationResolver } from './reconciliation.resolver';

@Module({
  providers: [ReconciliationService, ReconciliationResolver, PrismaService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
