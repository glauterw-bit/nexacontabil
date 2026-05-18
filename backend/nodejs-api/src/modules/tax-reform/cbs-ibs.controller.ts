import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CbsIbsService } from './cbs-ibs.service';

@Controller('tax-reform/cbs-ibs')
export class CbsIbsController {
  constructor(private readonly service: CbsIbsService) {}

  @Get('transition-table')
  table() {
    return {
      rates: this.service.getTransitionTable(),
      setores: this.service.getSetoresReducao(),
    };
  }

  @Post('simulate')
  simulate(@Body() body: any) {
    return this.service.simular(body);
  }

  @Get('destaque-dfe')
  destaque(@Query('valor') valor: string, @Query('ano') ano?: string) {
    return this.service.calcularDestaqueDfe(Number(valor), ano ? Number(ano) : 2026);
  }
}
