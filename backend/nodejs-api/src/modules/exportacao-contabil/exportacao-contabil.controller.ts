import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExportacaoContabilService } from './exportacao-contabil.service';

@Controller('exportacao-contabil')
@UseGuards(JwtAuthGuard)
export class ExportacaoContabilController {
  constructor(private readonly exportacaoService: ExportacaoContabilService) {}

  /**
   * GET /api/v1/exportacao-contabil/ofx?companyId=&dateFrom=&dateTo=
   * Exporta lançamentos em formato OFX
   */
  @Get('ofx')
  async exportarOFX(
    @Query('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response,
  ) {
    const conteudo = await this.exportacaoService.exportarOFX(
      companyId,
      new Date(dateFrom),
      new Date(dateTo),
    );

    const nomeArquivo = `lancamentos_${dateFrom}_${dateTo}.ofx`;
    res.setHeader('Content-Type', 'application/x-ofx');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(conteudo);
  }

  /**
   * GET /api/v1/exportacao-contabil/csv?companyId=&dateFrom=&dateTo=&formato=
   * Exporta lançamentos em CSV (formatos: dominio|alterdata|generico)
   */
  @Get('csv')
  async exportarCSV(
    @Query('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('formato') formato: 'dominio' | 'alterdata' | 'generico' = 'generico',
    @Res() res: Response,
  ) {
    const conteudo = await this.exportacaoService.exportarCSV(
      companyId,
      new Date(dateFrom),
      new Date(dateTo),
      formato,
    );

    const nomeArquivo = `lancamentos_${formato}_${dateFrom}_${dateTo}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    // BOM UTF-8 para compatibilidade com Excel
    res.send('﻿' + conteudo);
  }

  /**
   * GET /api/v1/exportacao-contabil/sped?companyId=&ano=
   * Exporta arquivo ECD (SPED Contábil)
   */
  @Get('sped')
  async exportarSPED(
    @Query('companyId') companyId: string,
    @Query('ano') ano: string,
    @Res() res: Response,
  ) {
    const conteudo = await this.exportacaoService.exportarSPEDContabil(
      companyId,
      parseInt(ano, 10),
    );

    const nomeArquivo = `ECD_${ano}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(conteudo);
  }
}
