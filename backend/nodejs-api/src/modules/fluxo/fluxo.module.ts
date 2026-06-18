import { Module, Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FluxoService, COLUNAS } from './fluxo.service';
import { PrismaService } from '../../database/prisma.service';
import { CloudModule } from '../cloud/cloud.module';

@Controller('fluxo')
@UseGuards(JwtAuthGuard)
class FluxoController {
  constructor(private readonly service: FluxoService) {}

  @Get('colunas')
  colunas() { return COLUNAS; }

  @Get('board')
  board(@Query('departamento') dep = 'fiscal', @Query('competencia') comp = '') {
    return this.service.board(dep, comp || new Date().toISOString().slice(0, 7));
  }

  @Post('mover')
  mover(@Body() b: { companyId: string; departamento: string; competencia: string; etapa: string }) {
    return this.service.mover(b.companyId, b.departamento, b.competencia, b.etapa);
  }

  @Post('verificar-recibo/:companyId')
  verificar(@Param('companyId') companyId: string, @Body() b: { competencia: string; departamento?: string }) {
    return this.service.verificarRecibo(companyId, b.competencia, b.departamento);
  }

  @Post('verificar-recibos-lote')
  lote(@Body() b: { competencia: string; limit?: number }) {
    return this.service.verificarRecibosLote(b.competencia, b.limit ?? 8);
  }
}

@Module({
  imports: [CloudModule],
  controllers: [FluxoController],
  providers: [FluxoService, PrismaService],
  exports: [FluxoService],
})
export class FluxoModule {}
