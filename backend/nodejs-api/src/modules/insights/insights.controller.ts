import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InsightsService } from './insights.service';

@Controller('insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly service: InsightsService) {}

  @Get('overview')
  overview() { return this.service.overview(); }

  @Get('progresso')
  progresso() { return this.service.progresso(); }

  @Get(':companyId')
  get(@Param('companyId') companyId: string) { return this.service.get(companyId); }

  @Post('gerar/:companyId')
  gerar(@Param('companyId') companyId: string) { return this.service.gerar(companyId); }

  @Post('lote')
  lote(@Body() body: { limit?: number; forcar?: boolean }) {
    return this.service.gerarLote(body?.limit ?? 50, body?.forcar ?? false);
  }
}
