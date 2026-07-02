import { Module } from '@nestjs/common';
import { FiscalCalendarController } from './fiscal-calendar.controller';
import { FiscalCalendarService } from './fiscal-calendar.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [FiscalCalendarController],
  providers: [FiscalCalendarService, PrismaService],
  exports: [FiscalCalendarService],
})
export class FiscalCalendarModule {}
