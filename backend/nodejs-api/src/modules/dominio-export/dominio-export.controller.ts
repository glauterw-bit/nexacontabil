import { Controller, Post, Body } from '@nestjs/common';
import { DominioExportService, DominioLayout } from './dominio-export.service';

@Controller('dominio-export')
export class DominioExportController {
  constructor(private readonly svc: DominioExportService) {}

  /** Gera o arquivo de importação de lançamentos contábeis para o Domínio. */
  @Post('lancamentos')
  lancamentos(@Body() body: {
    companyId: string;
    mesAno?: string;
    apenasAprovados?: boolean;
    layout?: Partial<DominioLayout>;
  }) {
    return this.svc.gerarLancamentos(body);
  }
}
