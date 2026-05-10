import { Module } from '@nestjs/common';
import { PatrimonioService } from './patrimonio.service';
import { PatrimonioResolver } from './patrimonio.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [PatrimonioService, PatrimonioResolver, PrismaService],
  exports: [PatrimonioService],
})
export class PatrimonioModule {}
