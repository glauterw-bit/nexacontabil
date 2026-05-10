import { Module } from '@nestjs/common';
import { ExportacaoContabilService } from './exportacao-contabil.service';
import { ExportacaoContabilController } from './exportacao-contabil.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ExportacaoContabilController],
  providers: [ExportacaoContabilService, PrismaService],
  exports: [ExportacaoContabilService],
})
export class ExportacaoContabilModule {}
