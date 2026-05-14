import { Module } from '@nestjs/common';
import { FinancialStatementsController } from './financial-statements.controller';
import { FinancialStatementsService } from './financial-statements.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [FinancialStatementsController],
  providers: [FinancialStatementsService, PrismaService],
})
export class FinancialStatementsModule {}
