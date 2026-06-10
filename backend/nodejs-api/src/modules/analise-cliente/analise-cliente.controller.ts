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
}
