import { Controller, Post, Body } from '@nestjs/common';
import { DominioExportService, DominioLayout, PlanoContas } from './dominio-export.service';

@Controller('dominio-export')
export class DominioExportController {
  constructor(private readonly svc: DominioExportService) {}

  /**
   * Gera o arquivo de importação para o Domínio.
   * fonte='fiscal' (padrão): monta a escrituração a partir das notas (XML) da competência.
   * fonte='contabil': exporta os lançamentos contábeis já aprovados (tabela transactions).
   */
  @Post('lancamentos')
  lancamentos(@Body() body: {
    companyId: string;
    mesAno?: string;
    fonte?: 'fiscal' | 'contabil';
    apenasAprovados?: boolean;
    layout?: Partial<DominioLayout>;
    plano?: Partial<PlanoContas>;
  }) {
    if (body?.fonte === 'contabil') return this.svc.gerarLancamentos(body);
    return this.svc.gerarLancamentosFiscais(body);
  }
}
