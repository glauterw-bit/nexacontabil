import { Module, Controller, Get, Post, Query, Body, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../../common/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { FluxoModule } from '../fluxo/fluxo.module';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';
import { FiscalCalendarModule } from '../fiscal-calendar/fiscal-calendar.module';
import { SolicitacoesModule } from '../solicitacoes/solicitacoes.module';
import { NcmInteligenteModule } from '../ncm-inteligente/ncm-inteligente.module';
import { SefazModule } from '../sefaz/sefaz.module';
import { VerificacaoFinalModule } from '../verificacao-final/verificacao-final.module';
import { TorreControleModule } from '../torre-controle/torre-controle.module';
import { CloudModule } from '../cloud/cloud.module';

@Controller('sync-drive')
@UseGuards(JwtAuthGuard)
class SyncSchedulerController {
  constructor(private readonly service: SyncSchedulerService) {}

  /** Situação da sincronização (última execução, próxima, intervalo). */
  @Get('status')
  status() {
    return this.service.status();
  }

  /** Dispara um ciclo manualmente (além do agendado). */
  @Post('run')
  run() {
    return this.service.runCycle('manual');
  }

  /** Progresso PÚBLICO da 1ª volta do Delta (só contadores) — permite acompanhamento externo. */
  @Public()
  @Get('progresso')
  progresso() {
    return this.service.progressoPublico();
  }

  /** Diagnóstico PÚBLICO da qualidade do acervo (XML parseado × PDF, empresas com docs). */
  @Public()
  @Get('diagnostico')
  diagnostico() {
    return this.service.diagnosticoDocs();
  }

  /** Amostra PÚBLICA da estrutura de XMLs sem valor (só tags) — descobrir o layout. */
  @Public()
  @Get('amostra-xml')
  amostraXml() {
    return this.service.amostraXmlSemValor();
  }

  /** Mapa PÚBLICO das pastas do OneDrive (só nomes de pasta agregados). */
  @Public()
  @Get('mapa-pastas')
  mapaPastas() {
    return this.service.mapearPastas();
  }

  /** Amostra PÚBLICA de como os comprovantes estão nomeados (valida a reconciliação). */
  @Public()
  @Get('amostra-comprovantes')
  amostraComprovantes() {
    return this.service.amostraComprovantes();
  }

  /** Varredura PROFUNDA ao vivo (Drive real × capturado) — revela falha do scanner. */
  @Public()
  @Get('escanear-profundo')
  escanearProfundo() {
    return this.service.escanearProfundo();
  }

  /** Refresca os links de pasta (corrige itemId obsoleto → pasta certa). */
  @Public()
  @Get('refrescar-pastas')
  refrescarPastas() {
    return this.service.refrescarPastas();
  }

  /** Realinha a carteira pelas pastas de "Empresas Ativas" (reativa clientes reais). */
  @Public()
  @Get('realinhar-carteira')
  realinharCarteira() {
    return this.service.realinharCarteira();
  }

  /** Teste do scanner de produção (delta) — acha os comprovantes de 2026? */
  @Public()
  @Get('escanear-delta')
  escanearDelta() {
    return this.service.escanearDelta();
  }

  /** Busca global no Drive (Search API) por um termo — varre TODAS as pastas/subpastas. */
  @Public()
  @Get('buscar-drive')
  buscarDrive(@Query('q') q?: string, @Query('pasta') pasta?: string) {
    return this.service.buscarNoDrive(q || 'PGDASD', pasta);
  }

  /** Reconciliação RÁPIDA via Search — comprovantes do ano por cliente (marca entregues). */
  @Public()
  @Get('reconciliar-search')
  reconciliarSearch(@Query('ano') ano?: string) {
    return this.service.reconciliarViaSearch(ano ? parseInt(ano, 10) : undefined);
  }

  /** Reconciliação GLOBAL por tipo (PGDASD/DCTF/FGTS...) — acha entregas de qualquer ano. */
  @Public()
  @Get('reconciliar-global')
  reconciliarGlobal(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarGlobal(lista);
  }

  /** Resultado da última reconciliação global (background). */
  @Public()
  @Get('reconciliar-global-status')
  reconciliarGlobalStatus() {
    return this.service.reconciliarGlobalStatus();
  }

  /** Reconciliação POR CLIENTE (código + classificação local) — background, acha nomes variados. */
  @Public()
  @Get('reconciliar-cliente')
  reconciliarCliente(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarPorCliente(lista);
  }
  @Public()
  @Get('reconciliar-cliente-status')
  reconciliarClienteStatus() {
    return this.service.reconciliarPorClienteStatus();
  }

  /** Listador de pastas 2026 (descobre pasta + lista tudo + zip) — background. */
  @Public()
  @Get('reconciliar-pastas2026')
  reconciliarPastas2026(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarListandoPastas(lista);
  }
  @Public()
  @Get('reconciliar-pastas2026-status')
  reconciliarPastas2026Status() {
    return this.service.reconciliarListandoPastasStatus();
  }

  /** Reconciliação por DOCUMENTOS do banco (companyId 100%) — fonte confiável, varre todas as empresas. */
  @Public()
  @Get('reconciliar-docs')
  reconciliarDocs(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarDocs(lista);
  }

  /** Diagnóstico do casamento por tipo (competência errada × doc ausente × cobertura folderPath). */
  @Public()
  @Get('diagnosticar-reconciliacao')
  diagnosticarReconciliacao(@Query('ano') ano?: string) {
    return this.service.diagnosticarReconciliacao(ano ? parseInt(ano, 10) : undefined);
  }

  /** Busca TENANT-WIDE (Microsoft Search API) — lê TODO o OneDrive numa varredura indexada. */
  @Public()
  @Get('busca-tenant')
  buscaTenant(@Query('q') q?: string) {
    return this.service.buscaTenant(q || 'PGDASD');
  }

  /** Resumo REAL das obrigações por tipo/status/mês num ano (verifica a reconciliação). */
  @Public()
  @Get('resumo-obrigacoes')
  resumoObrigacoes(@Query('ano') ano?: string, @Query('incluirInativos') inc?: string) {
    return this.service.resumoObrigacoes(ano ? parseInt(ano, 10) : undefined, inc === '1' || inc === 'true');
  }

  /** IDENTIFICA os clientes INATIVOS com obrigações em aberto (excluídos da taxa). */
  @Public()
  @Get('inativos-com-obrigacao')
  inativosComObrigacao(@Query('ano') ano?: string) {
    return this.service.clientesInativosComObrigacao(ano ? parseInt(ano, 10) : undefined);
  }

  /** LIMPA registros que não são empresas reais (pastas de controle). dry=1 só lista. */
  @Public()
  @Get('limpar-nao-clientes')
  limparNaoClientes(@Query('dry') dry?: string) {
    return this.service.limparNaoClientes({ dryRun: !(dry === '0' || dry === 'false') });
  }

  /** AUDITORIA DE COBERTURA por CRAWL (prova de completude) — 1 cliente. */
  @Public()
  @Get('auditar-cobertura')
  auditarCobertura(@Query('codigo') codigo: string, @Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.auditarCoberturaCliente(codigo, lista);
  }

  /** AUDITORIA DE COBERTURA em LOTE (N clientes ativos). */
  @Public()
  @Get('auditar-cobertura-lote')
  auditarCoberturaLote(@Query('limit') limit?: string, @Query('anos') anos?: string, @Query('offset') offset?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.auditarCoberturaLote(limit ? parseInt(limit, 10) : undefined, lista, offset ? parseInt(offset, 10) : undefined);
  }

  /** RECONCILIAÇÃO POR CRAWL (background) — enumera cada cliente ativo e marca entregue os recibos provados. */
  @Public()
  @Get('reconciliar-crawl')
  reconciliarCrawl(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarCrawlGlobal(lista);
  }
  @Public()
  @Get('reconciliar-crawl-status')
  reconciliarCrawlStatus() {
    return this.service.reconciliarCrawlStatus();
  }

  /** Diagnóstico de cobertura via permissão de APLICAÇÃO (sites+drives que o app enxerga). */
  @Public()
  @Get('enumerar-sites')
  enumerarSites() {
    return this.service.enumerarSitesEDrives();
  }

  /** Diagnóstico do gap de DAS — lista a pasta real de clientes com DAS vencido. */
  @Public()
  @Get('diag-das-faltante')
  diagDasFaltante(@Query('ano') ano?: string) {
    return this.service.diagnosticarDasFaltante(ano ? parseInt(ano, 10) : undefined);
  }

  /** Diagnostico Camada 3: PDFs de um cliente sao nativos (texto) ou escaneados (imagem)? */
  @Public()
  @Get('diag-pdf-cliente')
  diagPdfCliente(@Query('codigo') codigo: string) {
    return this.service.diagnosticarPdfCliente(codigo);
  }

  /** AUDITORIA DAS — N clientes SN estabelecidos: recibo existe no drive mas nao casou vs nao entregue. */
  @Public()
  @Get('auditar-das')
  auditarDas(@Query('ano') ano?: string, @Query('limit') limit?: string) {
    return this.service.auditarDasClientes(ano ? parseInt(ano, 10) : undefined, limit ? parseInt(limit, 10) : undefined);
  }

  /** SONDA onde os docs de um cliente vivem (por CNPJ/nome, ignorando estrutura de pasta). */
  @Public()
  @Get('sondar-cliente')
  sondarCliente(@Query('codigo') codigo: string) {
    return this.service.sondarClientePastas(codigo);
  }

  /** WEBHOOK do Graph — validação (echo do validationToken) + notificação de mudança (tempo real). */
  @Public()
  @Post('graph-webhook')
  graphWebhook(@Query('validationToken') vt: string, @Body() body: any, @Res() res: any) {
    if (vt) { res.set('Content-Type', 'text/plain').status(200).send(vt); return; }
    res.status(202).send(); // acusa rápido; processa em background
    try { this.service.onGraphNotification(body); } catch { /* nunca derruba o webhook */ }
  }

  /** Ativa os webhooks (cria subscriptions nos drives). */
  @Public()
  @Get('ativar-webhooks')
  ativarWebhooks() {
    return this.service.ativarWebhooks();
  }
  @Public()
  @Get('webhooks-status')
  webhooksStatus() {
    return this.service.webhooksStatus();
  }

  /** ENRIQUECE contatos (WhatsApp/e-mail) dos clientes via BrasilAPI — background. */
  @Public()
  @Get('enriquecer-contatos')
  enriquecerContatos() {
    return this.service.enriquecerContatos();
  }
  @Public()
  @Get('enriquecer-contatos-status')
  enriquecerContatosStatus() {
    return this.service.enriquecerContatosStatus();
  }

  /** Preview da planilha de clientes (.xlsx) — mostra linhas/colunas p/ achar a data de inicio. */
  @Public()
  @Get('preview-planilha')
  previewPlanilha(@Query('nome') nome?: string, @Query('rows') rows?: string, @Query('aba') aba?: string) {
    return this.service.previewPlanilha(nome, rows ? parseInt(rows, 10) : undefined, aba);
  }

  /** Importa e-mails da planilha do Fabiano -> company.email. dry=1 so conta. */
  @Public()
  @Get('importar-contatos-planilha')
  importarContatosPlanilha(@Query('dry') dry?: string) {
    return this.service.importarContatosPlanilha(!(dry === '0' || dry === 'false'));
  }

  /** Teste publico do explorador (arvore real de pastas do cliente). */
  @Public()
  @Get('explorar')
  explorar(@Query('codigo') codigo: string) {
    return this.service.explorar(codigo);
  }

  /** Checa empresas demo/ficticias (nome/CNPJ suspeito). */
  @Public()
  @Get('checar-demo')
  checarDemo() {
    return this.service.checarDemo();
  }

  /** Remove de vez as empresas demo/ficticias. */
  @Public()
  @Get('remover-demo')
  removerDemo() {
    return this.service.removerDemo();
  }

  /** Verificacao "tudo foi lido" via arvore completa — background. */
  @Public()
  @Get('reconciliar-arvore')
  reconciliarArvore(@Query('anos') anos?: string, @Query('limite') limite?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarViaArvore(lista, limite ? parseInt(limite, 10) : undefined);
  }
  @Public()
  @Get('reconciliar-arvore-status')
  reconciliarArvoreStatus() {
    return this.service.reconciliarViaArvoreStatus();
  }

  /** Link de CONSENTIMENTO de admin (Azure) — abrir 1x libera as permissões de aplicação. */
  @Public()
  @Get('admin-consent-url')
  adminConsentUrl() {
    return this.service.adminConsentUrl();
  }

  /** Reaplica a regra de vencidas (marca vencidas reais + reverte FGTS/eSocial p/ portal). */
  @Public()
  @Get('marcar-vencidas')
  marcarVencidas() {
    return this.service.marcarVencidas();
  }

  /** Reconciliação por SCAN COMPLETO (sites→drives→delta) — dispara em BACKGROUND. */
  @Public()
  @Get('reconciliar-app')
  reconciliarApp(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarAppOnly(lista);
  }

  /** Resultado da última reconciliação por scan completo (background). */
  @Public()
  @Get('reconciliar-app-status')
  reconciliarAppStatus() {
    return this.service.reconciliarAppStatus();
  }
}

@Module({
  imports: [FluxoModule, AnaliseClienteModule, FiscalCalendarModule, SolicitacoesModule, NcmInteligenteModule, SefazModule, VerificacaoFinalModule, TorreControleModule, CloudModule],
  controllers: [SyncSchedulerController],
  providers: [SyncSchedulerService, PrismaService],
})
export class SyncSchedulerModule {}
