import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DocumentsService } from './documents.service';
import { DocumentsResolver } from './documents.resolver';

@Module({
  providers: [DocumentsService, DocumentsResolver, PrismaService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
