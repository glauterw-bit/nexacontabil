import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CentralCobrancasService, CriarRegraDto } from './central-cobrancas.service';

@Controller('central-cobrancas')
@UseGuards(JwtAuthGuard)
export class CentralCobrancasController {
  constructor(private readonly centralCobrancasService: CentralCobrancasService) {}

  /**
   * POST /api/v1/central-cobrancas/regras
   * Criar regra de lembrete de cobrança
   */
  @Post('regras')
  @HttpCode(HttpStatus.CREATED)
  async criarRegra(
    @Query('companyId') companyId: string,
    @Body() dto: CriarRegraDto,
  ) {
    const regra = await this.centralCobrancasService.criarRegra(companyId, dto);
    return { success: true, data: regra };
  }

  /**
   * GET /api/v1/central-cobrancas/regras?companyId=xxx
   * Listar regras de cobrança
   */
  @Get('regras')
  async listarRegras(@Query('companyId') companyId: string) {
    const regras = await this.centralCobrancasService.listarRegras(companyId);
    return { success: true, data: regras };
  }

  /**
   * DELETE /api/v1/central-cobrancas/regras/:id
   * Remover uma regra
   */
  @Delete('regras/:id')
  async deletarRegra(@Param('id') id: string) {
    return this.centralCobrancasService.deletarRegra(id);
  }

  /**
   * POST /api/v1/central-cobrancas/processar?companyId=xxx
   * Processar lembretes de cobrança (disparar notificações pendentes)
   */
  @Post('processar')
  @HttpCode(HttpStatus.OK)
  async processarLembretes(@Query('companyId') companyId: string) {
    const resultado = await this.centralCobrancasService.processarLembretes(companyId);
    return { success: true, ...resultado };
  }

  /**
   * GET /api/v1/central-cobrancas/estatisticas?companyId=xxx
   * Estatísticas de boletos e cobranças
   */
  @Get('estatisticas')
  async getEstatisticas(@Query('companyId') companyId: string) {
    const stats = await this.centralCobrancasService.getEstatisticas(companyId);
    return { success: true, data: stats };
  }
}
