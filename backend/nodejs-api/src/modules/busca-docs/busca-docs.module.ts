import { Module } from '@nestjs/common';
import { BuscaDocsService } from './busca-docs.service';
import { BuscaDocsController } from './busca-docs.controller';
import { PrismaService } from '../../database/prisma.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [BuscaDocsController],
  providers: [BuscaDocsService, PrismaService],
  exports: [BuscaDocsService],
})
export class BuscaDocsModule {}
