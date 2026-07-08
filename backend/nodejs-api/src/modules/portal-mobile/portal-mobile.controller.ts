import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalMobileService } from './portal-mobile.service';

@Controller('meu-painel')
@UseGuards(JwtAuthGuard)
export class PortalMobileController {
  constructor(private readonly service: PortalMobileService) {}

  /** Painel do cliente (mobile). Cliente vê a própria empresa; gestor pode passar companyId p/ prever. */
  @Get()
  meuPainel(@Req() req: any, @Query('companyId') companyId?: string) {
    return this.service.meuPainel(req.user, companyId);
  }

  /** Cliente abre um chamado para o escritório. */
  @Post('chamado')
  abrirChamado(@Req() req: any, @Body() body: { assunto?: string; mensagem: string; categoria?: string }) {
    return this.service.abrirChamado(req.user, body);
  }
}
