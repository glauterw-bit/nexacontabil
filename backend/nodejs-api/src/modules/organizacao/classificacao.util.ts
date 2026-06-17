/**
 * Classificação fiscal/contábil de itens de NF-e a partir do CFOP, CST/CSOSN e NCM.
 * Usado para organizar os documentos por natureza no dashboard.
 */

// ── Natureza pela CFOP ──
export function direcaoPorCfop(cfop: string): 'entrada' | 'saida' | 'indef' {
  const d = String(cfop ?? '')[0];
  if (['1', '2', '3'].includes(d)) return 'entrada';
  if (['5', '6', '7'].includes(d)) return 'saida';
  return 'indef';
}
export function ambitoPorCfop(cfop: string): 'interna' | 'interestadual' | 'exterior' | 'indef' {
  const d = String(cfop ?? '')[0];
  if (['1', '5'].includes(d)) return 'interna';
  if (['2', '6'].includes(d)) return 'interestadual';
  if (['3', '7'].includes(d)) return 'exterior';
  return 'indef';
}

// ── Natureza pela tributação (CST/CSOSN) ──
export function tributacaoPorCst(cst: string): 'tributado' | 'st' | 'isento' | 'simples' | 'indef' {
  const c = String(cst ?? '').trim();
  if (c.length === 3) return 'simples';                       // CSOSN
  if (['00', '20', '90'].includes(c)) return 'tributado';
  if (['10', '30', '60', '70'].includes(c)) return 'st';      // com ST
  if (['40', '41', '50', '51'].includes(c)) return 'isento';  // isento/não-trib/susp/dif
  return 'indef';
}

// ── Monofásico de PIS/COFINS por NCM (Leis 10.147, 10.485, 10.560, 9.718) ──
// Prefixos de NCM dos principais grupos monofásicos.
const MONOFASICO: { grupo: string; prefixos: string[] }[] = [
  { grupo: 'Combustíveis', prefixos: ['2710', '2207', '2711', '3826'] },
  { grupo: 'Bebidas frias', prefixos: ['2201', '2202', '2203', '2106.90'] },
  { grupo: 'Farmacêuticos', prefixos: ['3001', '3002', '3003', '3004', '3005', '3006'] },
  { grupo: 'Perfumaria/Cosméticos', prefixos: ['3303', '3304', '3305', '3306', '3307', '3401'] },
  { grupo: 'Pneus/Câmaras', prefixos: ['4011', '4013'] },
  { grupo: 'Autopeças', prefixos: ['8708', '8714', '4016', '8421.23', '8421.31', '8511', '8512', '9026', '9029', '9031', '9032'] },
];

export function monofasicoPorNcm(ncm: string): string | null {
  const n = String(ncm ?? '').replace(/\D/g, '');
  if (!n) return null;
  for (const m of MONOFASICO) {
    for (const p of m.prefixos) {
      const pp = p.replace(/\D/g, '');
      if (n.startsWith(pp)) return m.grupo;
    }
  }
  return null;
}
