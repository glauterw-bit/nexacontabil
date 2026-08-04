import { norm, extractComp, compDe, detectTipo, cnpjValido } from './fiscal.util';

/**
 * Casos REAIS do acervo do escritório (cada um foi um bug ou quase-bug em produção).
 * Se um teste daqui quebrar, a reconciliação de obrigações vai marcar mês errado.
 */
describe('norm', () => {
  it('remove acento, caixa e pontuação', () => {
    expect(norm('CLÍNICA OWEN – DAS 06.2026.pdf')).toBe('clinica owen das 06 2026 pdf');
  });
  it('aguenta null/undefined', () => {
    expect(norm(undefined as any)).toBe('');
  });
});

describe('extractComp — formatos reais de pasta/arquivo', () => {
  const anos = [2025, 2026];
  const casos: Array<[string, string]> = [
    ['113 clinica owen 2026 06 2026 impostos', '2026-06'],   // /2026/06.2026/
    ['ano 2025 05 2025 pgdasd recibo', '2025-05'],           // "Ano 2025/05-2025"
    ['fiscal 2025 102025 pgdaab9 tr', '2025-10'],            // 102025 (MMYYYY colado)
    ['pgdasd recibo 26402041202605001', '2026-05'],          // YYYYMM embutido no protocolo
    ['das maio 2026', '2026-05'],                            // mês por extenso
  ];
  it.each(casos)('"%s" → %s', (texto, esperado) => {
    expect(extractComp(texto, anos)).toBe(esperado);
  });
  it('não inventa competência quando não há', () => {
    expect(extractComp('procuracao ecac assinada', anos)).toBeNull();
  });
});

describe('compDe — o bug da data de vencimento (nunca mais)', () => {
  const anos = [2025, 2026];
  it('VENCIMENTO 20.07.2026 no nome = competência 06/2026 (mês anterior)', () => {
    expect(compDe('113 CLÍNICA OWEN DAS - VENCIMENTO 20.07.2026.pdf', '', anos)).toBe('2026-06');
  });
  it('vencimento em janeiro = competência dezembro do ano ANTERIOR', () => {
    expect(compDe('DAS - VENCERÁ EM 22 - 01 - 2026.pdf', '', [2025, 2026])).toBe('2025-12');
  });
  it('a PASTA ganha do nome (pasta é a fonte mais confiável)', () => {
    expect(compDe('DAS - VENCIMENTO 20.07.2026.pdf', '2026/06.2026/Impostos', anos)).toBe('2026-06');
  });
  it('competência no nome ignora a parte do vencimento', () => {
    expect(compDe('DAS 06.2026 VENCE 20.07.2026.pdf', '', anos)).toBe('2026-06');
  });
  it('"VENCTO 20032026" (data colada) = competência 02/2026', () => {
    expect(compDe('454 - DAS R$ 7.930,92 - VENCTO 20032026.pdf', '', anos)).toBe('2026-02');
  });
  it('"VENCERÁ EM 20 - 08 - 2025" = competência 07/2025', () => {
    expect(compDe('DAS - 07 - 2025 - VENCERÁ EM 20 - 08 - 2025.pdf', '', anos)).toBe('2025-07');
  });
  it('sem pasta, sem competência e sem vencimento → null (não chuta)', () => {
    expect(compDe('Simples Nacional.pdf', '', anos)).toBeNull();
  });
});

describe('detectTipo — nomes reais dos recibos', () => {
  const casos: Array<[string, string | null]> = [
    ['pgdasd recibo 38708449202502001', 'DAS'],
    ['113 clinica owen rec simples nacional', 'DAS'],
    ['115 espaco damaru rec simples nacional sem movimento', 'DAS'],
    ['recibo de entrega da dctfweb', 'DCTFWeb'],
    ['recibo 24343787000152 122025 reinf', 'EFD_REINF'],
    ['dasn simei 2025', 'DASN-SIMEI'],
    ['relatorio solicitacao de licenca ass', null],
    ['boleto rf 01 2026', null],
  ];
  it.each(casos)('"%s" → %s', (nome, esperado) => {
    expect(detectTipo(nome)).toBe(esperado);
  });
});

describe('cnpjValido — separa CNPJ real de número inventado', () => {
  it('CNPJ real (DOMO) passa', () => {
    expect(cnpjValido('18.154.263/0001-10')).toBe(true);
  });
  it('14 dígitos aleatórios NÃO passam (pegou os registros-lixo "GERÊNCIA"/"Anexos")', () => {
    expect(cnpjValido('79405042334755')).toBe(false);
  });
  it('repetido não passa', () => {
    expect(cnpjValido('11111111111111')).toBe(false);
  });
  it('curto/vazio não passa', () => {
    expect(cnpjValido('123')).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});
