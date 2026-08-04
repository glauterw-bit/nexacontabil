/**
 * UTILITÁRIOS FISCAIS — fonte ÚNICA da lógica mais crítica do sistema.
 *
 * Antes, `norm`/`extractComp` existiam copiados 15× pelo código com variações sutis —
 * foi assim que nasceu o bug da data de vencimento ("DAS - VENCIMENTO 20.07.2026" lido
 * como competência 07 em alguns lugares e 06 em outros). Agora: 1 implementação, testada.
 *
 * Regras de negócio embutidas (aprendidas na prática com o acervo do escritório):
 *  - A competência mais confiável vem da PASTA (ex.: /2026/06.2026/), depois do NOME.
 *  - Data de VENCIMENTO no nome NÃO é competência: DAS/DCTF vencem no mês SEGUINTE
 *    ao da apuração ("VENCIMENTO 20.07.2026" ⇒ competência 06/2026).
 *  - O escritório nomeia de muitos jeitos: "06.2026", "06-2026", "062026", "202606",
 *    "junho 2026", "Ano 2025/06-2025"… — todos os formatos reais estão nos testes.
 */

/** Meses por extenso (sem acento — casar depois do norm()). */
export const MESES_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Normaliza texto p/ comparação: minúsculo, sem acento, só [a-z0-9] e espaços simples. */
export function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Extrai a competência (YYYY-MM) de um texto JÁ normalizado, testando os anos dados.
 * Reconhece: "06 2026", "2026 06", "062026", "202606" e "junho ... 2026".
 * Retorna null se nada casar (quem chama decide o fallback).
 */
export function extractComp(sNorm: string, anos: number[]): string | null {
  for (const y of anos) {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      if (
        sNorm.includes(`${mm} ${y}`) || sNorm.includes(`${y} ${mm}`) ||
        sNorm.includes(`${mm}${y}`) || sNorm.includes(`${y}${mm}`) ||
        (sNorm.includes(MESES_PT[m - 1]) && sNorm.includes(String(y)))
      ) return `${y}-${mm}`;
    }
  }
  return null;
}

/**
 * Competência de um RECIBO, à prova da data de vencimento no nome.
 * Ordem de confiança: 1) pasta (path) → 2) nome SEM a data de vencimento →
 * 3) só tem vencimento? competência = mês anterior.
 */
// "venc..." cobre vence/vencerá/VENCIMENTO/VENCTO; aceita "em/hoje/dia/até" no meio
// (padrões reais: "VENCIMENTO 20.07.2026", "VENCERÁ EM 22 - 01 - 2026", "VENCTO 20032026").
const VENC_CORE = 'venc[a-z]*(?:\\s+(?:em|hoje|dia|ate|no))*\\s*(\\d{1,2})\\s*(\\d{1,2})\\s*(\\d{4})';
const PAGAR_CORE = 'pagar?\\s*ate\\s*(\\d{1,2})\\s*(\\d{1,2})\\s*(\\d{4})';

export function compDe(nome: string, path: string, anos: number[]): string | null {
  const doPath = extractComp(norm(path), anos);
  if (doPath) return doPath;
  const nm = norm(nome);
  const semVenc = nm
    .replace(new RegExp(VENC_CORE, 'g'), ' ')
    .replace(new RegExp(PAGAR_CORE, 'g'), ' ');
  const doNome = extractComp(semVenc, anos);
  if (doNome) return doNome;
  const mv = nm.match(new RegExp(VENC_CORE)) || nm.match(new RegExp(PAGAR_CORE));
  if (mv) {
    const dm = +mv[2], dy = +mv[3];
    const compAno = dm === 1 ? dy - 1 : dy;
    if (dm >= 1 && dm <= 12 && anos.includes(compAno)) {
      return dm === 1 ? `${dy - 1}-12` : `${dy}-${String(dm - 1).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Tipo de obrigação a partir do NOME normalizado do arquivo (recibos do acervo real). */
export function detectTipo(n: string): string | null {
  if (/dasnsimei|\bdasn\b/.test(n)) return 'DASN-SIMEI';
  if (/pgdasd|pgdas|pgmei|(^|\s)das(\s|$)|simples nacional|(?:rec\w*|dec\w*|declara\w*|extrato)\s+sn(\s|$)|recibo de pagamento|extrato mensal|se?m\s*moviment/.test(n)) return 'DAS';
  if (/dctf/.test(n)) return 'DCTFWeb';
  if (/reinf/.test(n)) return 'EFD_REINF';
  if (/\bfgts\b|\bgrf\b/.test(n)) return 'FGTS';
  if (/darf/.test(n)) return 'DARF';
  if (/\bgia\b|gare|icms/.test(n)) return 'ICMS';
  if (/esocial|\besoc\b/.test(n)) return 'ESOCIAL';
  if (/defis/.test(n)) return 'DEFIS';
  return null;
}

/** CNPJ válido de verdade (dígitos verificadores) — separa CNPJ real de número inventado. */
export function cnpjValido(raw?: string | null): boolean {
  const s = (raw || '').replace(/\D/g, '');
  if (s.length !== 14 || /^(\d)\1{13}$/.test(s)) return false;
  const calc = (pesos: number[]) => {
    let sum = 0;
    for (let i = 0; i < pesos.length; i++) sum += parseInt(s[i], 10) * pesos[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === parseInt(s[12], 10) && d2 === parseInt(s[13], 10);
}
