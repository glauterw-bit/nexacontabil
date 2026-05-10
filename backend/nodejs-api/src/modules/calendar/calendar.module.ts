import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CalendarService } from './calendar.service';
import { CalendarResolver } from './calendar.resolver';

@Module({
  providers: [CalendarService, CalendarResolver, PrismaService],
  exports: [CalendarService],
})
export class CalendarModule {}
