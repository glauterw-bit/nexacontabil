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

  /** Matriz tributária completa do NCM entre duas UFs (ICMS/ST/DIFAL/IPI/PIS-COFINS). */
  @Get('matriz')
  matriz(@Query('ncm') ncm: string, @Query('origem') origem: string, @Query('destino') destino: string, @Query('segmento') segmento?: string, @Query('importado') importado?: string) {
    return this.svc.matriz({ ncm, origem, destino, segmento, importado: importado === '1' || importado === 'true' });
  }

  /** Auditoria semanal do Banco de NCM (completude + pendências de revisão). */
  @Get('auditoria')
  auditoria() {
    return this.svc.auditoria();
  }

  /** Alíquotas internas de ICMS por UF (banco atualizável). */
  @Get('aliquotas-uf')
  aliquotasUF() {
    return this.svc.listarAliquotasUF();
  }

  @Post('aliquotas-uf')
  setAliquotaUF(@Body() body: { uf: string; aliquota: number; por?: string }) {
    return this.svc.setAliquotaUF(body.uf, body.aliquota, body?.por);
  }

  /** Importa a tabela IBPT de uma UF (CSV baixado no portal do IBPT). */
  @Post('ibpt/importar')
  importarIbpt(@Body() body: { uf: string; csv: string }) {
    return this.svc.importarIbpt(body.uf, body.csv);
  }

  /** Status da IBPT importada (por UF, versão, quantidade). */
  @Get('ibpt/status')
  statusIbpt() {
    return this.svc.statusIbpt();
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

  @Post('aprender-documentos')
  aprenderDocs() {
    return this.svc.aprenderDeDocumentos();
  }

  @Post('enriquecer-ia')
  enriquecer(@Body() body: { limit?: number }) {
    return this.svc.enriquecerComIA(body?.limit ?? 15);
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
