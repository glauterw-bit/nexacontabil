import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SiegService } from './sieg.service';

@Controller('sieg')
@UseGuards(JwtAuthGuard)
export class SiegController {
  constructor(private readonly service: SiegService) {}

  /** Se o SIEG está configurado (SIEG_API_KEY) e os parâmetros da integração. */
  @Get('status')
  status() {
    return this.service.status();
  }

  /** Puxa os XMLs de UM cliente no período (default: mês corrente). */
  @Post('buscar-cliente')
  buscarCliente(@Body() body: { companyId: string; dataInicio?: string; dataFim?: string }) {
    return this.service.buscarCliente(body.companyId, { dataInicio: body?.dataInicio, dataFim: body?.dataFim });
  }

  /** Puxa em lote os clientes com CNPJ real há mais tempo sem leitura (limite por rate limit). */
  @Post('buscar-carteira')
  buscarCarteira(@Body() body: { limite?: number; dataInicio?: string; dataFim?: string }) {
    return this.service.buscarCarteira({ limite: body?.limite, dataInicio: body?.dataInicio, dataFim: body?.dataFim });
  }
}
