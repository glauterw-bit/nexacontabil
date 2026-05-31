import { Module } from '@nestjs/common';
import { TorreControleService } from './torre-controle.service';
import { TorreControleController } from './torre-controle.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [TorreControleController],
  providers: [TorreControleService, PrismaService],
  exports: [TorreControleService],
})
export class TorreControleModule {}
