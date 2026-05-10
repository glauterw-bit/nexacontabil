import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RadarEcacService } from './radar-ecac.service';

@Controller('radar-ecac')
@UseGuards(JwtAuthGuard)
export class RadarEcacController {
  constructor(private readonly radarEcacService: RadarEcacService) {}

  /**
   * GET /api/v1/radar-ecac/:cnpj
   * Consulta situação cadastral de um CNPJ
   */
  @Get(':cnpj')
  @HttpCode(HttpStatus.OK)
  async consultarCNPJ(@Param('cnpj') cnpj: string) {
    const resultado = await this.radarEcacService.consultarCNPJ(cnpj);
    return { success: true, data: resultado };
  }

  /**
   * GET /api/v1/radar-ecac/lote?companyId=xxx
   * Consulta todos os CNPJs cadastrados no tenant
   */
  @Get('lote')
  @HttpCode(HttpStatus.OK)
  async consultarLote(@Query('companyId') companyId: string) {
    const resultados = await this.radarEcacService.consultarLoteCNPJs(companyId);
    return {
      success: true,
      total: resultados.length,
      data: resultados,
    };
  }

  /**
   * GET /api/v1/radar-ecac/historico?companyId=xxx&cnpj=yyy
   * Histórico de consultas
   */
  @Get('historico')
  @HttpCode(HttpStatus.OK)
  async getHistorico(
    @Query('companyId') companyId: string,
    @Query('cnpj') cnpj?: string,
  ) {
    const historico = await this.radarEcacService.getHistorico(companyId, cnpj);
    return { success: true, data: historico };
  }
}
