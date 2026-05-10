import { Module } from '@nestjs/common';
import { RecalculoGuiasService } from './recalculo-guias.service';
import { RecalculoGuiasController } from './recalculo-guias.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [RecalculoGuiasController],
  providers: [RecalculoGuiasService, PrismaService],
  exports: [RecalculoGuiasService],
})
export class RecalculoGuiasModule {}
