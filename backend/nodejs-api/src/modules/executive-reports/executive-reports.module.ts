import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExecutiveReportsService } from './executive-reports.service';
import { ExecutiveReportsResolver } from './executive-reports.resolver';

@Module({
  providers: [ExecutiveReportsService, ExecutiveReportsResolver, PrismaService],
  exports: [ExecutiveReportsService],
})
export class ExecutiveReportsModule {}
