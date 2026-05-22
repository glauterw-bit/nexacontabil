import { Controller, Get, Post, Delete, Body, Query, Req, Res, Param } from '@nestjs/common';
import type { Response } from 'express';
import { OnvioService } from './onvio.service';
import { Public } from '../../common/public.decorator';

@Controller('onvio')
export class OnvioController {
  constructor(private readonly svc: OnvioService) {}

  @Get('status')
  status(@Req() req: any) {
    return this.svc.getStatus(req.user.id);
  }

  @Get('authorize')
  authorize(@Req() req: any, @Query('returnTo') returnTo?: string) {
    const url = this.svc.generateAuthUrl(req.user.id, returnTo);
    return { url };
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const frontend = process.env.FRONTEND_BASE_URL || 'https://frontend-production-2825.up.railway.app';
    try {
      if (!code) throw new Error('code OAuth ausente');
      const { returnTo } = await this.svc.exchangeCode(code, state);
      return res.redirect(`${frontend}${returnTo}?connected=onvio`);
    } catch (err: any) {
      return res.redirect(`${frontend}/onvio?error=${encodeURIComponent(err?.message ?? 'erro')}`);
    }
  }

  @Delete('disconnect')
  disconnect(@Req() req: any) {
    return this.svc.disconnect(req.user.id);
  }

  // ─── Features liberadas no painel Onvio do Sandro ────────────────

  @Post('notas-fiscais/:id/enviar')
  enviarNF(@Req() req: any, @Param('id') id: string) {
    return this.svc.enviarNotaFiscal(req.user.id, id);
  }

  @Get('notas-fiscais')
  consultarNFs(@Req() req: any, @Query('cnpj') cnpj?: string, @Query('periodo') periodo?: string) {
    return this.svc.consultarNotasFiscais(req.user.id, { cnpj, periodo });
  }

  @Post('baixas-parcelas/:boletoId/enviar')
  enviarBaixa(@Req() req: any, @Param('boletoId') boletoId: string) {
    return this.svc.enviarBaixaParcela(req.user.id, boletoId);
  }

  @Post('rubricas/:payslipId/enviar')
  enviarRubrica(@Req() req: any, @Param('payslipId') payslipId: string) {
    return this.svc.enviarRubricaFolha(req.user.id, payslipId);
  }
}
