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

  /** Sincronização por DELTA do Graph (eficiente/tempo real) — 1 cliente. */
  @Post('delta')
  delta(@Body() body: { companyId: string }) {
    return this.svc.sincronizarDelta(body.companyId);
  }

  /** Delta em lote (chamar em loop). */
  @Post('delta-lote')
  deltaLote(@Body() body: { limit?: number }) {
    return this.svc.sincronizarDeltaLote(body?.limit ?? 6);
  }

  /** Diagnóstico do acervo capturado: por tipo, por ano de emissão, sem-data, "temos 2026?". */
  @Get('diagnostico')
  diagnostico() {
    return this.svc.diagnostico();
  }

  /** Reprocessa NFS-e/XMLs sem valor com o parser ABRASF (re-baixa e extrai). */
  @Post('reprocessar-nfse')
  reprocessarNfse(@Body() body: { limit?: number; timeBudgetMs?: number }) {
    return this.svc.reprocessarSemValor(body ?? {});
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

  /** Re-processa os documentos sem data (NFS-e/CT-e com namespace). Loop até restantes=0. */
  @Post('reparsear-sem-data')
  reparsearSemData(@Body() body: { limit?: number }) {
    return this.svc.reparsearSemData(body?.limit ?? 400);
  }
}
