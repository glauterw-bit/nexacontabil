import { Module } from '@nestjs/common';
import { PlanejamentoTributarioService } from './planejamento-tributario.service';
import { PlanejamentoTributarioResolver } from './planejamento-tributario.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [PlanejamentoTributarioService, PlanejamentoTributarioResolver, PrismaService],
  exports: [PlanejamentoTributarioService],
})
export class PlanejamentoTributarioModule {}
