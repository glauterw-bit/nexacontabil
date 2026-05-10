import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportsService } from './reports.service';
import { ReportsResolver } from './reports.resolver';

@Module({
  providers: [ReportsService, ReportsResolver, PrismaService],
  exports: [ReportsService],
})
export class ReportsModule {}
