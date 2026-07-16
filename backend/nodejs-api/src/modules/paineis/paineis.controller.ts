import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/public.decorator';
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

  @Get('carteira-analistas')
  carteiraAnalistas() {
    return this.service.carteiraAnalistas();
  }

  @Get('painel-analista')
  painelAnalista(@Query('responsavel') responsavel?: string) {
    return this.service.painelAnalista(responsavel);
  }

  @Get('operacao')
  operacao(@Query('competencia') competencia?: string) {
    return this.service.operacao(competencia);
  }

  @Get('recibos-faltantes')
  recibosFaltantes(@Query('ano') ano?: string, @Query('tipo') tipo?: string) {
    return this.service.recibosFaltantes(ano ? parseInt(ano, 10) : undefined, tipo);
  }

  @Get('calendario-entregas')
  calendarioEntregas(@Query('ano') ano?: string) {
    return this.service.calendarioEntregas(ano ? parseInt(ano, 10) : undefined);
  }

  @Get('calendario-cliente')
  calendarioCliente(@Query('companyId') companyId: string, @Query('ano') ano?: string) {
    return this.service.calendarioClienteDetalhe(companyId, ano ? parseInt(ano, 10) : undefined);
  }

  @Get('explorar-cliente')
  explorarCliente(@Query('codigo') codigo: string, @Query('ano') ano?: string) {
    return this.service.explorarCliente(codigo, ano ? parseInt(ano, 10) : undefined);
  }

  @Get('lista-clientes')
  listaClientes() {
    return this.service.listaClientesSimples();
  }

  @Post('cliente-inicio')
  clienteInicio(@Body() body: { companyId: string; data: string }) {
    return this.service.definirInicioCliente(body.companyId, body.data);
  }

  /** Infere o início de TODOS os clientes (abertura + 1ª entrega) e isenta meses anteriores. */
  @Public()
  @Get('inicio-automatico')
  inicioAutomatico(@Query('dry') dry?: string) {
    return this.service.definirInicioAutomatico({ dryRun: dry === '1' || dry === 'true' });
  }

  @Get('farois')
  farois() {
    return this.service.farois();
  }

  @Get('monofasico')
  monofasico() {
    return this.service.monofasicoOportunidade();
  }

  @Get('monofasico-cliente')
  monofasicoCliente(@Query('companyId') companyId: string) {
    return this.service.monofasicoCliente(companyId);
  }

  @Get('entregas-mensais')
  entregasMensais() {
    return this.service.entregasMensais();
  }

  @Get('panorama')
  panorama() {
    return this.service.panorama();
  }

  @Get('tendencias')
  tendencias() {
    return this.service.tendencias();
  }

  @Get('cliente-360')
  clienteVisao360(@Query('companyId') companyId: string) {
    return this.service.clienteVisao360(companyId);
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

  @Get('saude-implantacao')
  saudeImplantacao() {
    return this.service.saudeImplantacao();
  }

  /** Auto-atribui os clientes sem responsável entre os analistas ativos (round-robin). */
  @Post('auto-atribuir')
  async autoAtribuir() {
    const r = await this.service.responsaveis();
    return this.service.distribuir(r.nomes ?? []);
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
