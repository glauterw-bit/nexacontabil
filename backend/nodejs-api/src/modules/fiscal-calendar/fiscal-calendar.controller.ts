import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FiscalCalendarService } from './fiscal-calendar.service';

@Controller('fiscal-calendar')
export class FiscalCalendarController {
  constructor(private readonly service: FiscalCalendarService) {}

  @Get()
  list(
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listByCompany(companyId, { status, from, to });
  }

  @Get('upcoming')
  upcoming(@Query('companyId') companyId: string, @Query('days') days?: string) {
    return this.service.upcoming(companyId, days ? Number(days) : 30);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Post(':id/pagar')
  pagar(@Param('id') id: string, @Body() body: { valorPago: number; comprovanteUrl?: string }) {
    return this.service.marcarPaga(id, body.valorPago, body.comprovanteUrl);
  }

  @Post('generate')
  generate(@Body() body: { companyId: string; ano: number }) {
    return this.service.gerarAnual(body.companyId, body.ano);
  }

  @Post('regenerar-todos')
  regenerarTodos(@Body() body: { ano?: number }) {
    return this.service.regenerarTodos(body?.ano ?? new Date().getFullYear());
  }

  @Post('mark-overdue')
  markOverdue() {
    return this.service.markOverdue();
  }

  /** Reconcilia obrigações pelos comprovantes já capturados nas pastas (entregue/vencida/pendente). */
  @Post('reconciliar')
  reconciliar(@Body() body: { ano?: number; limitEmpresas?: number; timeBudgetMs?: number }) {
    return this.service.reconciliarPorDocumentos(body ?? {});
  }
}
