import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PeriodClosingService } from './period-closing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('period-closing')
@UseGuards(JwtAuthGuard)
export class PeriodClosingController {
  constructor(private readonly service: PeriodClosingService) {}

  @Get()
  async get(
    @Query('companyId') companyId: string,
    @Query('ano') ano: string,
    @Query('mes') mes: string,
  ) {
    return this.service.getOrCreate(companyId, Number(ano), Number(mes));
  }

  @Get('list')
  async list(@Query('companyId') companyId: string) {
    return this.service.listByCompany(companyId);
  }

  @Post('close')
  async close(
    @Request() req: any,
    @Body() body: { companyId: string; ano: number; mes: number; forceClose?: boolean },
  ) {
    return this.service.close(body.companyId, body.ano, body.mes, req.user.email, !!body.forceClose);
  }

  @Post('reopen')
  async reopen(
    @Request() req: any,
    @Body() body: { companyId: string; ano: number; mes: number; motivo: string },
  ) {
    return this.service.reopen(body.companyId, body.ano, body.mes, req.user.email, body.motivo);
  }
}
