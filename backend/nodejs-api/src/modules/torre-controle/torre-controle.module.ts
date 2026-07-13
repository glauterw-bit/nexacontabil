import { Module } from '@nestjs/common';
import { TorreControleService } from './torre-controle.service';
import { SeedDemoService } from './seed-demo.service';
import { TorreControleController } from './torre-controle.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [TorreControleController],
  providers: [TorreControleService, SeedDemoService, PrismaService],
  exports: [TorreControleService, SeedDemoService],
})
export class TorreControleModule {}
