import { Module } from '@nestjs/common';
import { CentralCobrancasService } from './central-cobrancas.service';
import { CentralCobrancasController } from './central-cobrancas.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [CentralCobrancasController],
  providers: [CentralCobrancasService, PrismaService],
  exports: [CentralCobrancasService],
})
export class CentralCobrancasModule {}
