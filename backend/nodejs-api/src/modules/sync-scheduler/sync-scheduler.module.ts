import { Module, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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

  /** Reconciliação por DOCUMENTOS do banco (companyId 100%) — fonte confiável, varre todas as empresas. */
  @Public()
  @Get('reconciliar-docs')
  reconciliarDocs(@Query('anos') anos?: string) {
    const lista = anos ? anos.split(',').map((a) => parseInt(a, 10)).filter(Boolean) : undefined;
    return this.service.reconciliarDocs(lista);
  }
}

@Module({
  imports: [FluxoModule, AnaliseClienteModule, FiscalCalendarModule, SolicitacoesModule, NcmInteligenteModule, SefazModule, VerificacaoFinalModule, TorreControleModule],
  controllers: [SyncSchedulerController],
  providers: [SyncSchedulerService, PrismaService],
})
export class SyncSchedulerModule {}
