import { Module } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdService } from './lgpd.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [LgpdController],
  providers: [LgpdService, PrismaService],
})
export class LgpdModule {}
