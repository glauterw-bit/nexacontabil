import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaineisService } from './paineis.service';

// Analista só enxerga a própria carteira: ignora o param e usa o nome do login.
function escopo(req: any, responsavel?: string) {
  return req?.user?.role === 'analista' ? req.user.name : responsavel;
}

@Controller('paineis')
@UseGuards(JwtAuthGuard)
export class PaineisController {
  constructor(private readonly service: PaineisService) {}

  @Get('inconsistencias')
  inconsistencias(@Req() req: any, @Query('responsavel') responsavel?: string) {
    return this.service.inconsistencias(escopo(req, responsavel));
  }

  @Get('prazos')
  prazos(@Req() req: any, @Query('responsavel') responsavel?: string) {
    return this.service.prazos(escopo(req, responsavel));
  }

  @Get('produtividade')
  produtividade() {
    return this.service.produtividade();
  }

  @Get('gerencial')
  gerencial() {
    return this.service.gerencial();
  }

  @Get('operacao')
  operacao(@Query('competencia') competencia?: string) {
    return this.service.operacao(competencia);
  }

  @Post('limpar-carteira')
  limparCarteira(@Body() body: { dryRun?: boolean }) {
    return this.service.limparCarteira(body?.dryRun ?? false);
  }

  @Get('meu-dia')
  meuDia(@Req() req: any, @Query('responsavel') responsavel?: string) {
    return this.service.meuDia(escopo(req, responsavel));
  }

  @Get('cliente-erros')
  clienteErros(@Query('companyId') companyId: string) {
    return this.service.clienteErros(companyId);
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
