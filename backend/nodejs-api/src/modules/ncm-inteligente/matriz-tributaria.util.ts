/**
 * MATRIZ TRIBUTÁRIA — parte DETERMINÍSTICA (por lei), separada do que é dado atualizável.
 *
 * - Alíquota interestadual de ICMS: 4% (importado, Res. SF 13/2012), 7% (S/SE exceto ES
 *   → N/NE/CO/ES) ou 12% (demais). É EXATA — função de origem/destino.
 * - DIFAL = alíquota interna do DESTINO − alíquota interestadual. Exato dado o interno.
 * - Alíquota interna por UF: tabela ATUALIZÁVEL (o "banco de atualizações"); valores
 *   vigentes 2025/2026. Devem passar pela auditoria semanal do contador.
 */

export const REGIOES: Record<string, string[]> = {
  sul: ['PR', 'SC', 'RS'],
  sudeste: ['SP', 'RJ', 'MG', 'ES'],
  norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  centro_oeste: ['DF', 'GO', 'MT', 'MS'],
};

// Alíquota interna PADRÃO (mercadorias em geral) por UF — 2025/2026. ATUALIZÁVEL.
export const ICMS_INTERNO_UF: Record<string, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19, MA: 23,
  MG: 18, MS: 17, MT: 17, PA: 19, PB: 20, PR: 19.5, PE: 20.5, PI: 22.5, RJ: 22, RN: 18,
  RS: 17, RO: 19.5, RR: 20, SC: 17, SP: 18, SE: 20, TO: 20,
};

/** Alíquota interestadual de ICMS entre duas UFs. importado=true → 4%. */
export function aliquotaInterestadual(origemUF: string, destinoUF: string, importado = false): number {
  const o = (origemUF || '').toUpperCase();
  const d = (destinoUF || '').toUpperCase();
  if (o === d) return ICMS_INTERNO_UF[o] ?? 0; // operação interna
  if (importado) return 4;
  const origemSulSudeste = ['PR', 'SC', 'RS', 'SP', 'RJ', 'MG'].includes(o); // S/SE exceto ES
  const destinoNNCOes = [...REGIOES.norte, ...REGIOES.nordeste, ...REGIOES.centro_oeste, 'ES'].includes(d);
  if (origemSulSudeste && destinoNNCOes) return 7;
  return 12;
}

/** DIFAL (partilha) — diferença entre o interno do destino e a interestadual. */
export function difal(origemUF: string, destinoUF: string, importado = false): { interna: number; interestadual: number; difal: number } {
  const interna = ICMS_INTERNO_UF[(destinoUF || '').toUpperCase()] ?? 0;
  const inter = aliquotaInterestadual(origemUF, destinoUF, importado);
  return { interna, interestadual: inter, difal: Math.round((interna - inter) * 100) / 100 };
}

export function regiaoDaUF(uf: string): string {
  const u = (uf || '').toUpperCase();
  for (const [reg, ufs] of Object.entries(REGIOES)) if (ufs.includes(u)) return reg;
  return '';
}
