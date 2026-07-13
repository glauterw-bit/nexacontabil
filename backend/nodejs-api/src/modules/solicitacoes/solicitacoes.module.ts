import { Module, Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SolicitacoesService } from './solicitacoes.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('solicitacoes')
@UseGuards(JwtAuthGuard)
class SolicitacoesController {
  constructor(private readonly service: SolicitacoesService) {}
  @Get('overview')
  overview() { return this.service.overview(); }
  @Get('mensagem/:companyId')
  mensagem(@Param('companyId') companyId: string) { return this.service.mensagem(companyId); }

  /** Gera as solicitações mensais (o que roda no dia 01/02 — também chamável manual). */
  @Post('gerar-mensais')
  gerarMensais(@Body() body: { competencia?: string }) { return this.service.gerarSolicitacoesMensais(body?.competencia); }

  @Get('mensais')
  listarMensais(@Query('competencia') competencia?: string) { return this.service.listarMensais(competencia); }

  @Get('status-mensal')
  statusMensal(@Query('competencia') competencia?: string) { return this.service.statusMensal(competencia); }

  @Post('marcar-enviada/:id')
  marcarEnviada(@Param('id') id: string) { return this.service.marcarEnviada(id); }
}

@Module({
  controllers: [SolicitacoesController],
  providers: [SolicitacoesService, PrismaService],
  exports: [SolicitacoesService],
})
export class SolicitacoesModule {}
