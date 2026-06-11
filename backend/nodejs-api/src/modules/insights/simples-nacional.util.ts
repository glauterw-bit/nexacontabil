/**
 * Cálculo da alíquota efetiva do Simples Nacional (LC 123/2006, tabelas 2024).
 * Fórmula: efetiva = (RBT12 × alíq.nominal − parcela a deduzir) / RBT12
 * RBT12 = receita bruta acumulada nos últimos 12 meses.
 */

type Faixa = { ate: number; aliq: number; pd: number }; // aliq em fração (0.04 = 4%)

const ANEXOS: Record<string, Faixa[]> = {
  // Anexo I — Comércio
  I: [
    { ate: 180000, aliq: 0.04, pd: 0 },
    { ate: 360000, aliq: 0.073, pd: 5940 },
    { ate: 720000, aliq: 0.095, pd: 13860 },
    { ate: 1800000, aliq: 0.107, pd: 22500 },
    { ate: 3600000, aliq: 0.143, pd: 87300 },
    { ate: 4800000, aliq: 0.19, pd: 378000 },
  ],
  // Anexo II — Indústria
  II: [
    { ate: 180000, aliq: 0.045, pd: 0 },
    { ate: 360000, aliq: 0.078, pd: 5940 },
    { ate: 720000, aliq: 0.10, pd: 13860 },
    { ate: 1800000, aliq: 0.112, pd: 22500 },
    { ate: 3600000, aliq: 0.147, pd: 85500 },
    { ate: 4800000, aliq: 0.30, pd: 720000 },
  ],
  // Anexo III — Serviços (locação, transporte, e serviços com Fator R ≥ 28%)
  III: [
    { ate: 180000, aliq: 0.06, pd: 0 },
    { ate: 360000, aliq: 0.112, pd: 9360 },
    { ate: 720000, aliq: 0.135, pd: 17640 },
    { ate: 1800000, aliq: 0.16, pd: 35640 },
    { ate: 3600000, aliq: 0.21, pd: 125640 },
    { ate: 4800000, aliq: 0.33, pd: 648000 },
  ],
  // Anexo IV — Serviços (construção, limpeza, vigilância)
  IV: [
    { ate: 180000, aliq: 0.045, pd: 0 },
    { ate: 360000, aliq: 0.09, pd: 8100 },
    { ate: 720000, aliq: 0.102, pd: 12420 },
    { ate: 1800000, aliq: 0.14, pd: 39780 },
    { ate: 3600000, aliq: 0.22, pd: 183780 },
    { ate: 4800000, aliq: 0.33, pd: 828000 },
  ],
  // Anexo V — Serviços intelectuais com Fator R < 28%
  V: [
    { ate: 180000, aliq: 0.155, pd: 0 },
    { ate: 360000, aliq: 0.18, pd: 4500 },
    { ate: 720000, aliq: 0.195, pd: 9900 },
    { ate: 1800000, aliq: 0.205, pd: 17100 },
    { ate: 3600000, aliq: 0.23, pd: 62100 },
    { ate: 4800000, aliq: 0.305, pd: 540000 },
  ],
};

export function anexoPorSegmento(segmento?: string): keyof typeof ANEXOS {
  switch ((segmento ?? '').toLowerCase()) {
    case 'industria': return 'II';
    case 'servico': return 'III';   // default Anexo III (Fator R favorável); pode ser V
    case 'transporte': return 'III';
    case 'comercio':
    case 'outro':
    default: return 'I';
  }
}

/**
 * Calcula a alíquota efetiva e o DAS estimado para um cliente do Simples.
 * @returns aliquotaEfetiva em % (ex: 6.5) e o DAS anual estimado.
 */
export function calcularDasSimples(segmento: string | undefined, rbt12: number): {
  anexo: string; faixa: number; aliquotaEfetiva: number; dasAnual: number;
} {
  const anexo = anexoPorSegmento(segmento);
  const faixas = ANEXOS[anexo];
  const rbt = Math.max(0, rbt12);
  if (rbt <= 0) return { anexo, faixa: 1, aliquotaEfetiva: faixas[0].aliq * 100, dasAnual: 0 };
  let idx = faixas.findIndex((f) => rbt <= f.ate);
  if (idx === -1) idx = faixas.length - 1; // acima do teto → última faixa
  const f = faixas[idx];
  const efetiva = (rbt * f.aliq - f.pd) / rbt; // fração
  const aliquotaEfetiva = Math.max(0, Math.round(efetiva * 10000) / 100); // %
  return { anexo, faixa: idx + 1, aliquotaEfetiva, dasAnual: Math.round(rbt * efetiva) };
}
