import { Module } from '@nestjs/common';
import { NcmInteligenteService } from './ncm-inteligente.service';
import { NcmInteligenteController } from './ncm-inteligente.controller';
import { PrismaService } from '../../database/prisma.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [NcmInteligenteController],
  providers: [NcmInteligenteService, PrismaService],
  exports: [NcmInteligenteService],
})
export class NcmInteligenteModule {}
