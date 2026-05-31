import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NcmInteligenteService } from './ncm-inteligente.service';

@Controller('ncm-inteligente')
export class NcmInteligenteController {
  constructor(private readonly svc: NcmInteligenteService) {}

  @Get()
  listar(@Query('segmento') segmento?: string, @Query('busca') busca?: string, @Query('origem') origem?: string) {
    return this.svc.listar({ segmento, busca, origem });
  }

  @Get('estatisticas')
  estatisticas() {
    return this.svc.estatisticas();
  }

  @Get('lookup')
  lookup(@Query('ncm') ncm: string, @Query('segmento') segmento?: string, @Query('uf') uf?: string) {
    return this.svc.lookup(ncm, segmento, uf);
  }

  @Post('validar')
  validar(@Body() body: any) {
    return this.svc.validarTributacao(body);
  }

  @Post()
  upsert(@Body() body: any) {
    return this.svc.upsert(body);
  }

  @Post('bulk')
  bulk(@Body() body: { rules: any[] }) {
    return this.svc.bulkUpsert(body.rules ?? []);
  }

  @Post('aprender-xmls')
  aprender() {
    return this.svc.aprenderDeXmls();
  }

  @Post('classificar-ia')
  classificar(@Body() body: { ncm: string; descricao: string; segmento: string; uf?: string }) {
    return this.svc.classificarComIA(body.ncm, body.descricao, body.segmento, body.uf);
  }

  @Get('exportar')
  exportar(@Query('formato') formato?: 'json' | 'csv', @Query('segmento') segmento?: string) {
    return this.svc.exportar(formato ?? 'csv', segmento);
  }
}
