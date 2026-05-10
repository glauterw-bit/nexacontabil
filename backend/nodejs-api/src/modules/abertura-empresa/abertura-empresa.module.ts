import { Module } from '@nestjs/common';
import { AberturaEmpresaService } from './abertura-empresa.service';
import { AberturaEmpresaResolver } from './abertura-empresa.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [AberturaEmpresaService, AberturaEmpresaResolver, PrismaService],
  exports: [AberturaEmpresaService],
})
export class AberturaEmpresaModule {}
