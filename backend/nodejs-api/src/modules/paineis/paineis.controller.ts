import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaineisService } from './paineis.service';

@Controller('paineis')
@UseGuards(JwtAuthGuard)
export class PaineisController {
  constructor(private readonly service: PaineisService) {}

  @Get('inconsistencias')
  inconsistencias(@Query('responsavel') responsavel?: string) {
    return this.service.inconsistencias(responsavel);
  }

  @Get('prazos')
  prazos(@Query('responsavel') responsavel?: string) {
    return this.service.prazos(responsavel);
  }

  @Get('produtividade')
  produtividade() {
    return this.service.produtividade();
  }

  @Get('meu-dia')
  meuDia(@Query('responsavel') responsavel?: string) {
    return this.service.meuDia(responsavel);
  }
}
