import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NfeService } from './nfe.service';
import { NfeResolver } from './nfe.resolver';

@Module({
  providers: [NfeService, NfeResolver, PrismaService],
  exports: [NfeService],
})
export class NfeModule {}
