import { Module, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SyncSchedulerService } from './sync-scheduler.service';
import { FluxoModule } from '../fluxo/fluxo.module';
import { AnaliseClienteModule } from '../analise-cliente/analise-cliente.module';
import { FiscalCalendarModule } from '../fiscal-calendar/fiscal-calendar.module';

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
  imports: [FluxoModule, AnaliseClienteModule, FiscalCalendarModule],
  controllers: [SyncSchedulerController],
  providers: [SyncSchedulerService],
})
export class SyncSchedulerModule {}
