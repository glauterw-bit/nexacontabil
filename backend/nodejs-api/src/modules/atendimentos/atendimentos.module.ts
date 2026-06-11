import { Module } from '@nestjs/common';
import { AtendimentosService } from './atendimentos.service';
import { AtendimentosController } from './atendimentos.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [AtendimentosController],
  providers: [AtendimentosService, PrismaService],
  exports: [AtendimentosService],
})
export class AtendimentosModule {}
