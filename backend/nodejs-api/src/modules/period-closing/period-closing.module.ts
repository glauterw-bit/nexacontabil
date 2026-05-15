import { Module } from '@nestjs/common';
import { PeriodClosingController } from './period-closing.controller';
import { PeriodClosingService } from './period-closing.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [PeriodClosingController],
  providers: [PeriodClosingService, PrismaService],
  exports: [PeriodClosingService],
})
export class PeriodClosingModule {}
