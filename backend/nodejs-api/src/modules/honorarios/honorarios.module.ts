import { Module } from '@nestjs/common';
import { HonorariosService } from './honorarios.service';
import { HonorariosResolver } from './honorarios.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [HonorariosService, HonorariosResolver, PrismaService],
  exports: [HonorariosService],
})
export class HonorariosModule {}
