import { Module, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SyncSchedulerService } from './sync-scheduler.service';
import { FluxoModule } from '../fluxo/fluxo.module';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';
import { FiscalCalendarModule } from '../fiscal-calendar/fiscal-calendar.module';
import { SolicitacoesModule } from '../solicitacoes/solicitacoes.module';
import { NcmInteligenteModule } from '../ncm-inteligente/ncm-inteligente.module';

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
}

@Module({
  imports: [FluxoModule, AnaliseClienteModule, FiscalCalendarModule, SolicitacoesModule, NcmInteligenteModule],
  controllers: [SyncSchedulerController],
  providers: [SyncSchedulerService],
})
export class SyncSchedulerModule {}
