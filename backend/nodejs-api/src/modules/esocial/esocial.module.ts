import { Module } from '@nestjs/common';
import { EsocialService } from './esocial.service';
import { EsocialResolver } from './esocial.resolver';
import { PrismaService } from '../../database/prisma.service';
import { CertificadoDigitalModule } from '../certificado-digital/certificado-digital.module';

@Module({
  imports: [CertificadoDigitalModule],
  providers: [EsocialService, EsocialResolver, PrismaService],
  exports: [EsocialService],
})
export class EsocialModule {}
