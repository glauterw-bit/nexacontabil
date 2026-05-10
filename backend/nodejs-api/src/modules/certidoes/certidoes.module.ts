import { Module } from '@nestjs/common';
import { CertidoesService } from './certidoes.service';
import { CertidoesResolver } from './certidoes.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [CertidoesService, CertidoesResolver, PrismaService],
  exports: [CertidoesService],
})
export class CertidoesModule {}
