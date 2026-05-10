import { Module } from '@nestjs/common';
import { DashboardEscritorioService } from './dashboard-escritorio.service';
import { DashboardEscritorioController } from './dashboard-escritorio.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [DashboardEscritorioController],
  providers: [DashboardEscritorioService, PrismaService],
  exports: [DashboardEscritorioService],
})
export class DashboardEscritorioModule {}
