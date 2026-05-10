import { Module } from '@nestjs/common';
import { SimplesNacionalService } from './simples-nacional.service';
import { SimplesNacionalResolver } from './simples-nacional.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [SimplesNacionalService, SimplesNacionalResolver, PrismaService],
  exports: [SimplesNacionalService],
})
export class SimplesNacionalModule {}
