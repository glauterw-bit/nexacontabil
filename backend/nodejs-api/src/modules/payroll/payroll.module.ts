import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PayrollService } from './payroll.service';
import { PayrollResolver } from './payroll.resolver';

@Module({
  providers: [PayrollService, PayrollResolver, PrismaService],
  exports: [PayrollService],
})
export class PayrollModule {}
