import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FiscalNotesService } from './fiscal-notes.service';
import { FiscalNotesResolver } from './fiscal-notes.resolver';

@Module({
  providers: [FiscalNotesService, FiscalNotesResolver, PrismaService],
  exports: [FiscalNotesService],
})
export class FiscalNotesModule {}
