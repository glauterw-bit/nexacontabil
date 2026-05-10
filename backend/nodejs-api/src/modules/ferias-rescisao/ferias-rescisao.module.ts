import { Module } from '@nestjs/common';
import { FeriasRescisaoService } from './ferias-rescisao.service';
import { FeriasRescisaoResolver } from './ferias-rescisao.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [FeriasRescisaoService, FeriasRescisaoResolver, PrismaService],
  exports: [FeriasRescisaoService],
})
export class FeriasRescisaoModule {}
