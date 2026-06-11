import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { AtendimentosService } from './atendimentos.service';

@Controller('atendimentos')
export class AtendimentosController {
  constructor(private readonly service: AtendimentosService) {}

  @Get()
  listar(@Query('canal') canal?: string, @Query('status') status?: string, @Query('responsavel') responsavel?: string, @Query('q') q?: string) {
    return this.service.listar({ canal, status, responsavel, q });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Post()
  criar(@Body() body: any) {
    return this.service.criar(body);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any) {
    return this.service.atualizar(id, body);
  }

  // Webhook de ingestão externa (sistema legado / automações). Público pra
  // poder ser chamado sem login — protegido por token simples no body/header.
  @Public()
  @Post('ingest')
  ingest(@Body() body: any) {
    return this.service.ingest(body);
  }
}
