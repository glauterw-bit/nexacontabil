import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TransactionsService } from './transactions.service';
import { TransactionsResolver } from './transactions.resolver';

@Module({
  providers: [TransactionsService, TransactionsResolver, PrismaService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
