import { Module, Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { ChecklistService, CHECKLIST_TEMPLATES } from './checklist.service';

@Controller('checklist')
@UseGuards(JwtAuthGuard)
class ChecklistController {
  constructor(private readonly service: ChecklistService) {}

  /** Templates (os itens de cada departamento). */
  @Get('templates')
  templates() { return CHECKLIST_TEMPLATES; }

  /** Checklist de um cliente num departamento/competência. */
  @Get('cliente')
  cliente(@Query('companyId') companyId: string, @Query('departamento') departamento = 'fiscal', @Query('competencia') competencia?: string) {
    return this.service.doCliente(companyId, departamento, competencia);
  }

  /** Marca/desmarca um item. */
  @Post('marcar')
  marcar(@Body() body: { companyId: string; departamento: string; itemKey: string; feito: boolean; competencia?: string; feitoPor?: string }) {
    return this.service.marcar(body.companyId, body.departamento, body.itemKey, body.feito, body.competencia, body.feitoPor);
  }

  /** Visão da carteira (% concluído por depto). */
  @Get('overview')
  overview(@Query('competencia') competencia?: string) { return this.service.overview(competencia); }
}

@Module({
  controllers: [ChecklistController],
  providers: [ChecklistService, PrismaService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
