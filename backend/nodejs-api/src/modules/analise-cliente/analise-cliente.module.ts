import { Module } from '@nestjs/common';
import { AnaliseClienteService } from './analise-cliente.service';
import { AnaliseClienteController } from './analise-cliente.controller';
import { PrismaService } from '../../database/prisma.service';
import { CloudModule } from '../cloud/cloud.module';
import { NcmInteligenteModule } from '../ncm-inteligente/ncm-inteligente.module';
import { CertificadoDigitalModule } from '../certificado-digital/certificado-digital.module';

@Module({
  imports: [CloudModule, NcmInteligenteModule, CertificadoDigitalModule],
  controllers: [AnaliseClienteController],
  providers: [AnaliseClienteService, PrismaService],
  exports: [AnaliseClienteService],
})
export class AnaliseClienteModule {}
