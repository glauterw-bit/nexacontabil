import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FinancialStatementsService } from './financial-statements.service';

@Controller('financial-statements')
export class FinancialStatementsController {
  constructor(private readonly service: FinancialStatementsService) {}

  // DFC
  @Post('dfc')
  createDfc(@Body() body: any) {
    return this.service.createDfc(body);
  }

  @Post('dfc/auto')
  generateDfc(@Body() body: { companyId: string; periodoInicio: string; periodoFim: string; metodo?: 'direto' | 'indireto' }) {
    return this.service.gerarAutomatico(body.companyId, body.periodoInicio, body.periodoFim, body.metodo);
  }

  @Get('dfc')
  listDfc(@Query('companyId') companyId: string) {
    return this.service.listDfc(companyId);
  }

  @Get('dfc/:id')
  getDfc(@Param('id') id: string) {
    return this.service.getDfc(id);
  }

  // DMPL
  @Post('dmpl')
  upsertDmpl(@Body() body: any) {
    return this.service.upsertDmpl(body);
  }

  @Get('dmpl')
  listDmpl(@Query('companyId') companyId: string) {
    return this.service.listDmpl(companyId);
  }
}
