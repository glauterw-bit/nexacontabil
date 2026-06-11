import { Module } from '@nestjs/common';
import { PaineisService } from './paineis.service';
import { PaineisController } from './paineis.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [PaineisController],
  providers: [PaineisService, PrismaService],
  exports: [PaineisService],
})
export class PaineisModule {}
