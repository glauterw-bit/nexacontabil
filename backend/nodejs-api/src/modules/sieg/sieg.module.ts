import { Module } from '@nestjs/common';
import { SiegService } from './sieg.service';
import { SiegController } from './sieg.controller';
import { PrismaService } from '../../database/prisma.service';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';

@Module({
  imports: [AnaliseClienteModule], // reusa parse + validação fiscal + ingestão em Document
  controllers: [SiegController],
  providers: [SiegService, PrismaService],
  exports: [SiegService],
})
export class SiegModule {}
