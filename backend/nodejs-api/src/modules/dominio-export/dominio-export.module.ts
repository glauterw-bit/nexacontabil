import { Module } from '@nestjs/common';
import { DominioExportService } from './dominio-export.service';
import { DominioExportController } from './dominio-export.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [DominioExportController],
  providers: [DominioExportService, PrismaService],
  exports: [DominioExportService],
})
export class DominioExportModule {}
