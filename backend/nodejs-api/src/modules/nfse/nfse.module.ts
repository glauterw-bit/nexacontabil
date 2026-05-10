import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NfseService } from './nfse.service';
import { NfseResolver } from './nfse.resolver';

@Module({
  providers: [NfseService, NfseResolver, PrismaService],
  exports: [NfseService],
})
export class NfseModule {}
