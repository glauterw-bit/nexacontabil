import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardEscritorioService } from './dashboard-escritorio.service';

@Controller('dashboard-escritorio')
@UseGuards(JwtAuthGuard)
export class DashboardEscritorioController {
  constructor(private readonly dashboardService: DashboardEscritorioService) {}

  /**
   * GET /api/v1/dashboard-escritorio?companyId=xxx
   * Retorna dashboard completo do escritório contábil
   */
  @Get()
  async getDashboard(@Query('companyId') companyId: string) {
    const dashboard = await this.dashboardService.getDashboard(companyId);
    return { success: true, data: dashboard };
  }
}
