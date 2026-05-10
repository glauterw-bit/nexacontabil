import { Module } from '@nestjs/common';
import { TarefasService } from './tarefas.service';
import { TarefasResolver } from './tarefas.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [TarefasService, TarefasResolver, PrismaService],
  exports: [TarefasService],
})
export class TarefasModule {}
