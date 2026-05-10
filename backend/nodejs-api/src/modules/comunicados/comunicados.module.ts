import { Module } from '@nestjs/common';
import { ComunicadosService } from './comunicados.service';
import { ComunicadosResolver } from './comunicados.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [ComunicadosService, ComunicadosResolver, PrismaService],
  exports: [ComunicadosService],
})
export class ComunicadosModule {}
