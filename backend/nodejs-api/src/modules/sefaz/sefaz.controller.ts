import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SefazDistribuicaoService } from './sefaz-distribuicao.service';

@Controller('sefaz')
@UseGuards(JwtAuthGuard)
export class SefazController {
  constructor(private readonly service: SefazDistribuicaoService) {}

  /** Status da integração (ambiente, e — se companyId — se o cliente está pronto p/ buscar). */
  @Get('status')
  status(@Query('companyId') companyId?: string) {
    return this.service.status(companyId);
  }

  /** Busca as NF-e do cliente no SEFAZ (DistribuiçãoDFe) desde o último NSU e ingere. */
  @Post('buscar-cliente')
  buscarCliente(@Body() body: { companyId: string; senha?: string; maxIteracoes?: number }) {
    return this.service.buscarCliente(body.companyId, body?.senha, body?.maxIteracoes);
  }

  /** Situação do certificado do ESCRITÓRIO (um só p/ todos, via procuração). */
  @Get('certificado-escritorio')
  statusEscritorio() {
    return this.service.statusEscritorio();
  }

  /** Sobe o certificado A1 do ESCRITÓRIO. */
  @Post('certificado-escritorio')
  salvarEscritorio(@Body() body: { pfxBase64: string; senha: string; nome: string }) {
    return this.service.salvarCertEscritorio(body.pfxBase64, body.senha, body.nome);
  }
}
