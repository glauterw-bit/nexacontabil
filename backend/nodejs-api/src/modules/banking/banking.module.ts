import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BankingService } from './banking.service';
import { BankingResolver } from './banking.resolver';

@Module({
  providers: [BankingService, BankingResolver, PrismaService],
  exports: [BankingService],
})
export class BankingModule {}
