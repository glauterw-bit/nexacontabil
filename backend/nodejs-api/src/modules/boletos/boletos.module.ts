import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BoletosService } from './boletos.service';
import { BoletosResolver } from './boletos.resolver';

@Module({
  providers: [BoletosService, BoletosResolver, PrismaService],
  exports: [BoletosService],
})
export class BoletosModule {}
