import { Module } from '@nestjs/common';
import { ChartAccountsController } from './chart-accounts.controller';
import { ChartAccountsService } from './chart-accounts.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ChartAccountsController],
  providers: [ChartAccountsService, PrismaService],
  exports: [ChartAccountsService],
})
export class ChartAccountsModule {}
