import { Module } from '@nestjs/common';
import { DashboardEmpresaService } from './dashboard-empresa.service';
import { DashboardEmpresaController } from './dashboard-empresa.controller';
import { PrismaService } from '../../database/prisma.service';
import { PredictiveModule } from '../predictive/predictive.module';
import { HealthScoreModule } from '../health-score/health-score.module';

@Module({
  imports: [PredictiveModule, HealthScoreModule],
  controllers: [DashboardEmpresaController],
  providers: [DashboardEmpresaService, PrismaService],
})
export class DashboardEmpresaModule {}
