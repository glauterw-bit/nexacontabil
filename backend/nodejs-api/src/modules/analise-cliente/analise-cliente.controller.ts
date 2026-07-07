import { Controller, Post, Get, Body } from '@nestjs/common';
import { AnaliseClienteService } from './analise-cliente.service';

@Controller('analise-cliente')
export class AnaliseClienteController {
  constructor(private readonly svc: AnaliseClienteService) {}

  /** Progresso da análise da carteira (pra barra de progresso ao vivo). */
  @Get('progresso')
  progresso() {
    return this.svc.progresso();
  }

  /** Lê os XMLs da pasta SharePoint do cliente, analisa e salva. */
  @Post()
  analisar(@Body() body: { companyId: string; maxFiles?: number }) {
    return this.svc.analisarCliente(body.companyId, body.maxFiles);
  }

  /** Analisa um lote de clientes ainda não analisados (chamar em loop até zerar). */
  @Post('lote')
  lote(@Body() body: { limit?: number; maxFiles?: number; incluirInativos?: boolean }) {
    return this.svc.analisarLote(body?.limit ?? 8, body?.maxFiles ?? 80, body?.incluirInativos ?? false);
  }

  /** Re-varredura profunda de TODA a carteira (busca arquivos recentes/2026). Chamar em loop até restantes=0. */
  @Post('resync')
  resync(@Body() body: { desde: string; limit?: number; maxFiles?: number }) {
    return this.svc.resyncLote(body.desde, body?.limit ?? 8, body?.maxFiles ?? 300);
  }

  /** Diagnóstico do acervo capturado: por tipo, por ano de emissão, sem-data, "temos 2026?". */
  @Get('diagnostico')
  diagnostico() {
    return this.svc.diagnostico();
  }

  /** Limpa análises e zera flags (pra re-análise com parser novo). */
  @Post('reset')
  reset() {
    return this.svc.resetAnalises();
  }

  /** Re-valida todos os documentos contra o Banco de NCM atual (cheio). */
  @Post('revalidar')
  revalidar() {
    return this.svc.revalidarDocumentos();
  }
}
