import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from './audit.service';
import { AuditResolver } from './audit.resolver';

@Module({
  providers: [AuditService, AuditResolver, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
