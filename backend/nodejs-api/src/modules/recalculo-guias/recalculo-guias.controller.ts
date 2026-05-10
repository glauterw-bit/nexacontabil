import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecalculoGuiasService } from './recalculo-guias.service';

class RecalculoDto {
  valorOriginal: number;
  dataVencimento: string;
  dataPagamento?: string;
}

class SimularDto {
  valorOriginal: number;
  dataVencimento: string;
  tipo: 'das' | 'darf';
  quantidadeMeses?: number;
}

@Controller('recalculo-guias')
@UseGuards(JwtAuthGuard)
export class RecalculoGuiasController {
  constructor(private readonly recalculoGuiasService: RecalculoGuiasService) {}

  /**
   * POST /api/v1/recalculo-guias/das
   * Recalcular DAS com multa de 2%
   */
  @Post('das')
  @HttpCode(HttpStatus.OK)
  recalcularDAS(@Body() dto: RecalculoDto) {
    const resultado = this.recalculoGuiasService.recalcularDAS({
      valorOriginal: dto.valorOriginal,
      dataVencimento: new Date(dto.dataVencimento),
      dataPagamento: dto.dataPagamento ? new Date(dto.dataPagamento) : undefined,
    });
    return { success: true, tipo: 'DAS', data: resultado };
  }

  /**
   * POST /api/v1/recalculo-guias/darf
   * Recalcular DARF com multa de 7.5%
   */
  @Post('darf')
  @HttpCode(HttpStatus.OK)
  recalcularDARF(@Body() dto: RecalculoDto) {
    const resultado = this.recalculoGuiasService.recalcularDARF({
      valorOriginal: dto.valorOriginal,
      dataVencimento: new Date(dto.dataVencimento),
      dataPagamento: dto.dataPagamento ? new Date(dto.dataPagamento) : undefined,
    });
    return { success: true, tipo: 'DARF', data: resultado };
  }

  /**
   * POST /api/v1/recalculo-guias/simular
   * Simula múltiplas datas de pagamento futuras
   */
  @Post('simular')
  @HttpCode(HttpStatus.OK)
  simular(@Body() dto: SimularDto) {
    const simulacao = this.recalculoGuiasService.simularProximosDias(
      dto.valorOriginal,
      new Date(dto.dataVencimento),
      dto.tipo || 'das',
      dto.quantidadeMeses || 6,
    );
    return {
      success: true,
      tipo: (dto.tipo || 'das').toUpperCase(),
      valorOriginal: dto.valorOriginal,
      dataVencimento: dto.dataVencimento,
      simulacoes: simulacao,
    };
  }
}
