import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface RecalculoInput {
  valorOriginal: number;
  dataVencimento: Date;
  dataPagamento?: Date;
}

export interface RecalculoResult {
  valorOriginal: number;
  multa: number;
  juros: number;
  valorAtualizado: number;
  diasAtraso: number;
  mesesAtraso: number;
  dataVencimento: Date;
  dataPagamento: Date;
  percentualMulta: number;
  percentualJuros: number;
}

export interface SimulacaoItem {
  dataPagamento: string;
  resultado: RecalculoResult;
}

@Injectable()
export class RecalculoGuiasService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly SELIC_MENSAL = parseFloat(process.env.SELIC_MENSAL || '0.01075');
  private readonly MULTA_DAS = 0.02;      // 2%
  private readonly MULTA_DARF = 0.075;    // 7.5%

  private _calcular(input: RecalculoInput, percentualMulta: number): RecalculoResult {
    const dataPagamento = input.dataPagamento ? new Date(input.dataPagamento) : new Date();
    const dataVencimento = new Date(input.dataVencimento);

    const diffMs = dataPagamento.getTime() - dataVencimento.getTime();
    const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const mesesAtraso = diasAtraso > 0 ? Math.ceil(diasAtraso / 30) : 0;

    const multa = diasAtraso > 0 ? input.valorOriginal * percentualMulta : 0;
    const juros = mesesAtraso > 0 ? input.valorOriginal * (this.SELIC_MENSAL * mesesAtraso) : 0;
    const valorAtualizado = input.valorOriginal + multa + juros;

    return {
      valorOriginal: input.valorOriginal,
      multa: parseFloat(multa.toFixed(2)),
      juros: parseFloat(juros.toFixed(2)),
      valorAtualizado: parseFloat(valorAtualizado.toFixed(2)),
      diasAtraso,
      mesesAtraso,
      dataVencimento,
      dataPagamento,
      percentualMulta: percentualMulta * 100,
      percentualJuros: parseFloat((this.SELIC_MENSAL * mesesAtraso * 100).toFixed(4)),
    };
  }

  recalcularDAS(input: RecalculoInput): RecalculoResult {
    return this._calcular(input, this.MULTA_DAS);
  }

  recalcularDARF(input: RecalculoInput): RecalculoResult {
    return this._calcular(input, this.MULTA_DARF);
  }

  simularMultasDatas(
    valorOriginal: number,
    dataVencimento: Date,
    tipo: 'das' | 'darf',
    datasSimulacao: Date[],
  ): SimulacaoItem[] {
    const percentualMulta = tipo === 'das' ? this.MULTA_DAS : this.MULTA_DARF;

    return datasSimulacao.map(dataPagamento => {
      const resultado = this._calcular(
        { valorOriginal, dataVencimento, dataPagamento },
        percentualMulta,
      );
      return {
        dataPagamento: dataPagamento.toISOString().split('T')[0],
        resultado,
      };
    });
  }

  simularProximosDias(
    valorOriginal: number,
    dataVencimento: Date,
    tipo: 'das' | 'darf',
    quantidadeDias = 6,
  ): SimulacaoItem[] {
    const datas: Date[] = [];
    const hoje = new Date();

    for (let i = 0; i < quantidadeDias; i++) {
      const data = new Date(hoje);
      data.setDate(data.getDate() + i * 30); // Simula em intervalos de 30 dias
      datas.push(data);
    }

    return this.simularMultasDatas(valorOriginal, dataVencimento, tipo, datas);
  }
}
