import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AtendimentosService } from './atendimentos.service';

@Controller('atendimentos')
export class AtendimentosController {
  constructor(private readonly service: AtendimentosService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  listar(@Query('canal') canal?: string, @Query('status') status?: string, @Query('responsavel') responsavel?: string, @Query('q') q?: string) {
    return this.service.listar({ canal, status, responsavel, q });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  stats() {
    return this.service.stats();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  criar(@Body() body: any) {
    return this.service.criar(body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  atualizar(@Param('id') id: string, @Body() body: any) {
    return this.service.atualizar(id, body);
  }

  // Webhook de ingestão (MEGA). Protegido por token simples no header, pra
  // poder ser chamado por sistema externo sem login.
  @Post('ingest')
  ingest(@Body() body: any) {
    return this.service.ingest(body);
  }
}
