import { Module } from '@nestjs/common';
import { PaineisService } from './paineis.service';
import { PaineisController } from './paineis.controller';
import { PrismaService } from '../../database/prisma.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';

@Module({
  imports: [AnaliseClienteModule, WhatsappModule],
  controllers: [PaineisController],
  providers: [PaineisService, PrismaService],
  exports: [PaineisService],
})
export class PaineisModule {}
