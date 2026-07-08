import { Module } from '@nestjs/common';
import { SefazDistribuicaoService } from './sefaz-distribuicao.service';
import { SefazController } from './sefaz.controller';
import { PrismaService } from '../../database/prisma.service';
import { CertificadoDigitalModule } from '../certificado-digital/certificado-digital.module';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';

@Module({
  imports: [CertificadoDigitalModule, AnaliseClienteModule],
  controllers: [SefazController],
  providers: [SefazDistribuicaoService, PrismaService],
  exports: [SefazDistribuicaoService],
})
export class SefazModule {}
