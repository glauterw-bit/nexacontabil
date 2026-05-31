import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { EsteiraFiscalService } from './esteira-fiscal.service';

@Controller('esteira-fiscal')
export class EsteiraFiscalController {
  constructor(private readonly svc: EsteiraFiscalService) {}

  /** Dispara a esteira: varre pasta do Drive, roteia por CNPJ, valida e envia relatórios. */
  @Post('executar')
  executar(
    @Req() req: any,
    @Body() body: { connectionId: string; folderId?: string; enviarRelatorios?: boolean },
  ) {
    return this.svc.executar(req.user.id, body);
  }

  @Get('execucoes')
  execucoes(@Req() req: any) {
    return this.svc.listarExecucoes(req.user.id);
  }

  @Get('execucoes/:id')
  detalhe(@Param('id') id: string) {
    return this.svc.detalheExecucao(id);
  }
}
