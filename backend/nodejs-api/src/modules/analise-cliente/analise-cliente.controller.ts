import { Controller, Post, Body } from '@nestjs/common';
import { AnaliseClienteService } from './analise-cliente.service';

@Controller('analise-cliente')
export class AnaliseClienteController {
  constructor(private readonly svc: AnaliseClienteService) {}

  /** Lê os XMLs da pasta SharePoint do cliente, analisa e salva. */
  @Post()
  analisar(@Body() body: { companyId: string; maxFiles?: number }) {
    return this.svc.analisarCliente(body.companyId, body.maxFiles);
  }

  /** Analisa um lote de clientes ainda não analisados (chamar em loop até zerar). */
  @Post('lote')
  lote(@Body() body: { limit?: number; maxFiles?: number }) {
    return this.svc.analisarLote(body?.limit ?? 8, body?.maxFiles ?? 80);
  }

  /** Limpa análises e zera flags (pra re-análise com parser novo). */
  @Post('reset')
  reset() {
    return this.svc.resetAnalises();
  }
}
