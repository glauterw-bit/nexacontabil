import { Controller, Get, Post, Delete, Query, Req } from '@nestjs/common';
import { TorreControleService } from './torre-controle.service';
import { SeedDemoService } from './seed-demo.service';

@Controller('torre-controle')
export class TorreControleController {
  constructor(
    private readonly svc: TorreControleService,
    private readonly seedSvc: SeedDemoService,
  ) {}

  /** Visão consolidada do escritório (office-wide) em uma chamada. */
  @Get('overview')
  overview(@Query('competencia') competencia?: string, @Query('analistaId') analistaId?: string) {
    return this.svc.overview(competencia, analistaId);
  }

  /** Popula dados de demonstração (analistas, carteiras, tarefas, pendências). */
  @Post('seed-demo')
  seed(@Req() req: any) {
    return this.seedSvc.seed(req.user.id);
  }

  /** Remove todos os dados de demonstração. */
  @Delete('seed-demo')
  limpar() {
    return this.seedSvc.limpar();
  }
}
