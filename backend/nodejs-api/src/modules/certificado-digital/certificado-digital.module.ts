import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { CertificadoDigitalResolver } from './certificado-digital.resolver';

@Module({
  providers: [CertificadoDigitalService, CertificadoDigitalResolver, PrismaService],
  exports: [CertificadoDigitalService],
})
export class CertificadoDigitalModule {}
