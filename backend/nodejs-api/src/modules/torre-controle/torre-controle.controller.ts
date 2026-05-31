import { Controller, Get, Query } from '@nestjs/common';
import { TorreControleService } from './torre-controle.service';

@Controller('torre-controle')
export class TorreControleController {
  constructor(private readonly svc: TorreControleService) {}

  /** Visão consolidada do escritório (office-wide) em uma chamada. */
  @Get('overview')
  overview(@Query('competencia') competencia?: string, @Query('analistaId') analistaId?: string) {
    return this.svc.overview(competencia, analistaId);
  }
}
