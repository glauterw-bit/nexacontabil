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

// ── Monofásico / concentração de PIS/COFINS por NCM ──────────────────────
// Base LEGAL (não estatística): na etapa de fabricante/importador a alíquota é
// concentrada; na REVENDA (atacado/varejo) o PIS/COFINS é 0%. Fontes:
//   • Autopeças e veículos — Lei 10.485/2002, Anexos I e II (lista enumerada abaixo).
//   • Pneus/câmaras — Lei 10.485/2002, art. 5º.
//   • Farmacêuticos/perfumaria/higiene — Lei 10.147/2000 (fab. 2,1%/9,9% e 2,2%/10,3%).
//   • Bebidas frias — Lei 10.833/2003 art. 58-A e Lei 13.097/2015.
//   • Combustíveis — Leis 9.718/1998 e 10.336/2001.
// Códigos normalizados só com dígitos; casamento por prefixo (o "Ex" da TIPI é
// tratado como inclusão do código-base — direção segura para revenda destes nichos).
export interface RegraMonofasico { grupo: string; lei: string; pisFab?: number; cofinsFab?: number }

const MONOFASICO: { grupo: string; lei: string; pisFab?: number; cofinsFab?: number; prefixos: string[] }[] = [
  {
    grupo: 'Autopeças', lei: 'Lei 10.485/2002 (Anexos I e II)', pisFab: 2.3, cofinsFab: 10.8,
    prefixos: [
      // Anexo I
      '40161010', '40169990', '6813', '70071100', '70072100', '70091000', '73201000',
      '8511', '83012000', '83023000', '84073390', '84073490', '840820', '840991', '840999',
      '841330', '84139100', '84148021', '84148022', '841520', '84212300', '84213100',
      '84314100', '84314200', '84339090', '84818099', '848310', '84832000', '848330',
      '848340', '848350', '850520', '85071000', '851220', '85123000', '851240', '85129000',
      '85272', '85365090', '853910', '85443000', '870600', '8707', '8708', '90292010',
      '90299010', '90303921', '90318040', '903289', '91040000', '94012000',
      // Anexo II (implementos/veículos/tratores e conjuntos)
      '4009', '8429', '843320', '84333000', '84334000', '84335', '8701', '8702', '8703',
      '8704', '8705', '8706', '8431', '84089090', '84122110', '84122190', '84123110',
      '84136019', '84148019', '84149039', '84329000', '84324000', '84328000', '84811000',
      '84812090', '84818092', '848360', '85011019',
    ],
  },
  { grupo: 'Pneus e câmaras', lei: 'Lei 10.485/2002, art. 5º', pisFab: 2.0, cofinsFab: 9.5, prefixos: ['4011', '4013'] },
  {
    grupo: 'Farmacêuticos', lei: 'Lei 10.147/2000', pisFab: 2.1, cofinsFab: 9.9,
    prefixos: ['3001', '3003', '3004', '300210', '300220', '30063', '30066'],
  },
  {
    grupo: 'Perfumaria/Higiene/Cosméticos', lei: 'Lei 10.147/2000', pisFab: 2.2, cofinsFab: 10.3,
    prefixos: ['3303', '3304', '3305', '3306', '3307', '34011190', '34012010', '96032100'],
  },
  { grupo: 'Bebidas frias', lei: 'Lei 10.833/2003 art. 58-A / Lei 13.097/2015', prefixos: ['2201', '2202', '2203', '21069010'] },
  { grupo: 'Combustíveis', lei: 'Leis 9.718/1998 e 10.336/2001', prefixos: ['2710', '2711', '2207', '3826'] },
];

/** Grupo monofásico do NCM (ou null). Compatível com os chamadores existentes. */
export function monofasicoPorNcm(ncm: string): string | null {
  const r = regraMonofasico(ncm);
  return r ? r.grupo : null;
}

/** Regra completa (grupo, lei, alíquotas de fábrica) do NCM monofásico, ou null. */
export function regraMonofasico(ncm: string): RegraMonofasico | null {
  const n = String(ncm ?? '').replace(/\D/g, '');
  if (n.length < 4) return null;
  for (const m of MONOFASICO) {
    for (const p of m.prefixos) {
      if (n.startsWith(p)) return { grupo: m.grupo, lei: m.lei, pisFab: m.pisFab, cofinsFab: m.cofinsFab };
    }
  }
  return null;
}
