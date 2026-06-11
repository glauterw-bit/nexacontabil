import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaineisService } from './paineis.service';

@Controller('paineis')
@UseGuards(JwtAuthGuard)
export class PaineisController {
  constructor(private readonly service: PaineisService) {}

  @Get('inconsistencias')
  inconsistencias(@Query('responsavel') responsavel?: string) {
    return this.service.inconsistencias(responsavel);
  }

  @Get('prazos')
  prazos(@Query('responsavel') responsavel?: string) {
    return this.service.prazos(responsavel);
  }

  @Get('produtividade')
  produtividade() {
    return this.service.produtividade();
  }

  @Get('meu-dia')
  meuDia(@Query('responsavel') responsavel?: string) {
    return this.service.meuDia(responsavel);
  }

  @Get('responsaveis')
  responsaveis() {
    return this.service.responsaveis();
  }

  @Get('clientes-atribuicao')
  listarClientes(@Query('q') q?: string, @Query('sem') sem?: string) {
    return this.service.listarClientes(q, sem === '1' || sem === 'true');
  }

  @Post('atribuir')
  atribuir(@Body() body: { companyIds: string[]; responsavel: string }) {
    return this.service.atribuir(body?.companyIds ?? [], body?.responsavel ?? '');
  }

  @Post('distribuir')
  distribuir(@Body() body: { nomes: string[] }) {
    return this.service.distribuir(body?.nomes ?? []);
  }
}
