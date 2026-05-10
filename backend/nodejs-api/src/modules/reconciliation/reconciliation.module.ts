import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationResolver } from './reconciliation.resolver';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [ReconciliationService, ReconciliationResolver, PrismaService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
