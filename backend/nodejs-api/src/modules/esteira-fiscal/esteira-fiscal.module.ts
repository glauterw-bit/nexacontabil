import { Module } from '@nestjs/common';
import { EsteiraFiscalService } from './esteira-fiscal.service';
import { EsteiraFiscalController } from './esteira-fiscal.controller';
import { PrismaService } from '../../database/prisma.service';
import { CloudModule } from '../cloud/cloud.module';
import { AiModule } from '../ai/ai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NcmInteligenteModule } from '../ncm-inteligente/ncm-inteligente.module';

@Module({
  imports: [CloudModule, AiModule, WhatsappModule, NcmInteligenteModule],
  controllers: [EsteiraFiscalController],
  providers: [EsteiraFiscalService, PrismaService],
  exports: [EsteiraFiscalService],
})
export class EsteiraFiscalModule {}
