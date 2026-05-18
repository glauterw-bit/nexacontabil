import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Simulador CBS/IBS — Lei Complementar 214/2025.
 * Cronograma oficial RFB:
 *   2026: 0,1% IBS + 0,9% CBS (informativo, sem recolhimento — art. 348)
 *   2027: CBS pleno + extincao PIS/COFINS
 *   2028: idem
 *   2029-2032: transicao gradual ICMS/ISS -> IBS (10% ao ano)
 *   2033: IBS pleno, ICMS/ISS extintos
 */
export const TRANSITION_RATES: Record<number, {
  ibs: number;   // alíquota IBS (federal + estadual + municipal)
  cbs: number;   // alíquota CBS
  pisCofins: number; // alíquota agregada PIS+COFINS no regime atual
  icms: number;  // alíquota ICMS média
  iss: number;   // alíquota ISS média
  status: string;
}> = {
  2026: { ibs: 0.1,  cbs: 0.9,  pisCofins: 9.25, icms: 18,  iss: 5,   status: 'informativo' },
  2027: { ibs: 0,    cbs: 8.8,  pisCofins: 0,    icms: 18,  iss: 5,   status: 'cbs_pleno' },
  2028: { ibs: 0,    cbs: 8.8,  pisCofins: 0,    icms: 18,  iss: 5,   status: 'cbs_pleno' },
  2029: { ibs: 18,   cbs: 8.8,  pisCofins: 0,    icms: 16.2, iss: 4.5, status: 'transicao_10pct' },
  2030: { ibs: 18,   cbs: 8.8,  pisCofins: 0,    icms: 14.4, iss: 4.0, status: 'transicao_20pct' },
  2031: { ibs: 18,   cbs: 8.8,  pisCofins: 0,    icms: 12.6, iss: 3.5, status: 'transicao_30pct' },
  2032: { ibs: 18,   cbs: 8.8,  pisCofins: 0,    icms: 10.8, iss: 3.0, status: 'transicao_40pct' },
  2033: { ibs: 26.5, cbs: 8.8,  pisCofins: 0,    icms: 0,    iss: 0,   status: 'ibs_pleno' },
};

export const SETORES_REDUCAO: Record<string, number> = {
  // Setores com redução de alíquota da LC 214/2025
  saude: 60,
  educacao: 60,
  transporte_publico: 60,
  alimentos_basicos: 100, // isenção (cesta basica)
  medicamentos_essenciais: 100,
  produtos_agropecuarios: 60,
  insumos_agricolas: 60,
  servicos_culturais: 30,
  imoveis_residencial: 50,
  servicos_profissionais_liberais: 30,
  hotelaria: 40,
  geral: 0,
};

@Injectable()
export class CbsIbsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula carga tributária comparativa entre regime ATUAL e novo (CBS/IBS).
   */
  simular(input: {
    receitaAnual: number;
    setor?: keyof typeof SETORES_REDUCAO;
    regimeAtual: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
    anosBase?: number[];
  }) {
    const setorReducao = SETORES_REDUCAO[input.setor ?? 'geral'] ?? 0;
    const anos = input.anosBase ?? [2026, 2027, 2029, 2031, 2033];

    const linhas = anos.map((ano) => {
      const r = TRANSITION_RATES[ano];
      if (!r) return null;
      const fatorReducao = 1 - setorReducao / 100;

      // Carga novo regime (CBS + IBS reduzidos pelo setor)
      const cargaNovo = input.receitaAnual * ((r.cbs + r.ibs) / 100) * fatorReducao;

      // Carga regime atual (estimativa simplificada)
      let cargaAtual = 0;
      if (input.regimeAtual === 'SIMPLES_NACIONAL') {
        // Estimativa media Anexo III: 11% efetivo
        cargaAtual = input.receitaAnual * 0.11;
      } else if (input.regimeAtual === 'LUCRO_PRESUMIDO') {
        // PIS+COFINS+ISS+IRPJ+CSLL combinados aproximados
        const aliquotaAtual = (r.pisCofins + r.iss + 4.8) / 100; // 4.8% IRPJ+CSLL sobre servicos
        cargaAtual = input.receitaAnual * aliquotaAtual;
      } else {
        const aliquotaAtual = (r.pisCofins + r.icms + 9.25) / 100;
        cargaAtual = input.receitaAnual * aliquotaAtual;
      }

      const diff = cargaNovo - cargaAtual;
      const pctDiff = cargaAtual > 0 ? (diff / cargaAtual) * 100 : 0;

      return {
        ano,
        rates: r,
        cargaNovo,
        cargaAtual,
        diferenca: diff,
        pctDiferenca: pctDiff,
        impacto: diff > 0 ? 'aumento' : 'reducao',
      };
    }).filter(Boolean);

    const economiaTotal = linhas.reduce((s: number, l: any) => s + (l.diferenca < 0 ? -l.diferenca : 0), 0);
    const aumentoTotal = linhas.reduce((s: number, l: any) => s + (l.diferenca > 0 ? l.diferenca : 0), 0);

    return {
      input,
      setorReducao,
      linhas,
      sumario: {
        economiaTotalNoPeriodo: economiaTotal,
        aumentoTotalNoPeriodo: aumentoTotal,
        impactoLiquido: aumentoTotal - economiaTotal,
        recomendacao: aumentoTotal > economiaTotal
          ? 'Avaliar mudanca de regime tributario ou setor de redução'
          : 'Reforma traz alívio fiscal acumulado neste cenário',
      },
    };
  }

  /**
   * Retorna o destaque obrigatorio IBS+CBS para uma NF-e/NFS-e — Nota Tecnica 2026/007.
   * Em 2026 estes valores DEVEM aparecer no documento fiscal mesmo nao havendo recolhimento.
   */
  calcularDestaqueDfe(valorTributavel: number, ano: number = 2026) {
    const r = TRANSITION_RATES[ano];
    if (!r) throw new Error(`Aliquotas para ${ano} nao definidas`);
    return {
      valorBase: valorTributavel,
      valorIbs: +(valorTributavel * r.ibs / 100).toFixed(2),
      valorCbs: +(valorTributavel * r.cbs / 100).toFixed(2),
      aliquotaIbs: r.ibs,
      aliquotaCbs: r.cbs,
      ano,
      observacao: r.status === 'informativo'
        ? 'IBS+CBS destacados em carater informativo (art. 348 LC 214/2025) — sem recolhimento'
        : 'IBS+CBS com recolhimento obrigatorio',
    };
  }

  getTransitionTable() {
    return TRANSITION_RATES;
  }

  getSetoresReducao() {
    return SETORES_REDUCAO;
  }
}
