import { Module } from '@nestjs/common';
import { BuscaDocsService } from './busca-docs.service';
import { BuscaDocsController } from './busca-docs.controller';
import { PrismaService } from '../../database/prisma.service';
import { AiModule } from '../ai/ai.module';
import { CloudModule } from '../cloud/cloud.module';

@Module({
  imports: [AiModule, CloudModule],
  controllers: [BuscaDocsController],
  providers: [BuscaDocsService, PrismaService],
  exports: [BuscaDocsService],
})
export class BuscaDocsModule {}
