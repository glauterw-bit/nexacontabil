import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from './documents.service';
import { DocumentsResolver } from './documents.resolver';
import { DocumentsController } from './documents.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsResolver, PrismaService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
