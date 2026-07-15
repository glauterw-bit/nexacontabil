import { Module } from '@nestjs/common';
import { PaineisService } from './paineis.service';
import { PaineisController } from './paineis.controller';
import { PrismaService } from '../../database/prisma.service';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';

@Module({
  imports: [AnaliseClienteModule],
  controllers: [PaineisController],
  providers: [PaineisService, PrismaService],
  exports: [PaineisService],
})
export class PaineisModule {}
