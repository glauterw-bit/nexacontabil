import { Module, Controller, Get, Post } from '@nestjs/common';
import { GestaoAdminService } from './gestao-admin.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('gestao-admin')
class GestaoAdminController {
  constructor(private readonly svc: GestaoAdminService) {}

  /** Visão administrador: todos os clientes com métricas. */
  @Get('clientes')
  clientes() { return this.svc.clientesOverview(); }

  /** Gera obrigações fiscais (calendário) por regime pra todos os clientes. */
  @Post('gerar-obrigacoes')
  gerarObrigacoes() { return this.svc.gerarObrigacoes(); }

  /** Deriva o segmento fiscal pelo nome do cliente. */
  @Post('derivar-segmentos')
  derivarSegmentos() { return this.svc.derivarSegmentos(); }
}

@Module({
  controllers: [GestaoAdminController],
  providers: [GestaoAdminService, PrismaService],
})
export class GestaoAdminModule {}
