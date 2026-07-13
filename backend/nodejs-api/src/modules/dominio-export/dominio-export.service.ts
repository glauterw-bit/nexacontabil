import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Gera arquivo de importação de Lançamentos Contábeis para o Domínio Sistemas
 * (Thomson Reuters), SEM depender de API/Onvio.
 *
 * O Domínio importa lançamentos via "Utilitários → Importar → Lançamentos"
 * num arquivo texto delimitado. Como cada escritório pode ter um layout
 * ligeiramente diferente, o formato é TOTALMENTE configurável (separador,
 * formato de data, decimal, ordem dos campos). Os defaults seguem o layout
 * "Domínio padrão" delimitado por ';'.
 *
 * Decompositor de partidas: qualquer lançamento balanceado (1:1, 1:N, N:1,
 * N:M) é quebrado em linhas débito/crédito/valor válidas via algoritmo guloso.
 */
export interface DominioLayout {
  separator: string;          // ';' | '|' | '\t'
  dateFormat: 'DD/MM/YYYY' | 'DDMMYYYY' | 'YYYY-MM-DD';
  decimalSep: ',' | '.';
  codHistoricoPadrao: string; // código de histórico padrão do Domínio (ex: '1')
  incluirHistorico: boolean;  // anexa o histórico complementar (descrição)
  campos: string[];           // ordem: data|debito|credito|valor|codHistorico|historico|filial
}

const LAYOUT_PADRAO: DominioLayout = {
  separator: ';',
  dateFormat: 'DD/MM/YYYY',
  decimalSep: ',',
  codHistoricoPadrao: '1',
  incluirHistorico: true,
  campos: ['data', 'debito', 'credito', 'valor', 'codHistorico', 'historico'],
};

interface EntryParsed { conta: string; natureza: 'D' | 'C'; valor: number }

/** Plano de contas padrão (configurável no body). O contador ajusta pelo dele. */
export interface PlanoContas {
  clientes: string; fornecedores: string; receita: string; compras: string;
  icmsRecolher: string; icmsVendas: string;
}
const PLANO_PADRAO: PlanoContas = {
  clientes: '1.1.02.001',      // Clientes / Duplicatas a receber
  fornecedores: '2.1.01.001',  // Fornecedores
  receita: '3.1.01.001',       // Receita bruta de vendas
  compras: '1.1.03.001',       // Estoques / Compras
  icmsRecolher: '2.1.04.001',  // ICMS a recolher
  icmsVendas: '3.1.02.001',    // (-) ICMS sobre vendas
};
function safeJson(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

interface LinhaLancamento {
  data: Date;
  debito: string;
  credito: string;
  valor: number;
  historico: string;
}

@Injectable()
export class DominioExportService {
  constructor(private readonly prisma: PrismaService) {}

  async gerarLancamentos(input: {
    companyId: string;
    mesAno?: string;          // 'YYYY-MM' — opcional (default: todos aprovados)
    apenasAprovados?: boolean;
    layout?: Partial<DominioLayout>;
  }) {
    if (!input.companyId) throw new BadRequestException('companyId obrigatório');
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const layout: DominioLayout = { ...LAYOUT_PADRAO, ...(input.layout ?? {}) };

    const where: any = { companyId: input.companyId };
    if (input.apenasAprovados !== false) where.status = { in: ['approved', 'aprovado', 'posted'] };
    if (input.mesAno) {
      const [y, m] = input.mesAno.split('-').map(Number);
      where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const transacoes = await this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const linhas: LinhaLancamento[] = [];
    const avisos: string[] = [];
    let transacoesOk = 0;

    for (const tx of transacoes) {
      const entries = this.parseEntries(tx.entries);
      if (!entries.length) {
        avisos.push(`Lançamento ${tx.id.slice(0, 8)} (${tx.description}) sem partidas — ignorado`);
        continue;
      }
      const debitos = entries.filter(e => e.natureza === 'D');
      const creditos = entries.filter(e => e.natureza === 'C');
      const totalD = round(debitos.reduce((s, e) => s + e.valor, 0));
      const totalC = round(creditos.reduce((s, e) => s + e.valor, 0));
      if (Math.abs(totalD - totalC) > 0.01) {
        avisos.push(`Lançamento ${tx.id.slice(0, 8)} desbalanceado (D=${totalD} C=${totalC}) — ignorado`);
        continue;
      }
      const pares = this.decomporPartidas(debitos, creditos);
      if (!pares) {
        avisos.push(`Lançamento ${tx.id.slice(0, 8)} não pôde ser decomposto — revisar manualmente`);
        continue;
      }
      for (const p of pares) {
        linhas.push({ data: tx.date, debito: p.debito, credito: p.credito, valor: p.valor, historico: tx.description ?? '' });
      }
      transacoesOk++;
    }

    const conteudo = linhas.map(l => this.formatarLinha(l, layout)).join('\r\n');
    // Domínio importa em ANSI (Windows-1252 ~ latin1)
    const conteudoBase64Ansi = Buffer.from(conteudo, 'latin1').toString('base64');

    return {
      companyId: input.companyId,
      companyName: company.name,
      cnpj: company.cnpj,
      periodo: input.mesAno ?? 'todos',
      totalTransacoes: transacoes.length,
      transacoesExportadas: transacoesOk,
      totalLinhas: linhas.length,
      avisos,
      layout,
      nomeArquivo: `dominio_lancamentos_${(company.cnpj || '').replace(/\D/g, '')}_${input.mesAno ?? 'geral'}.txt`,
      conteudo,            // preview UTF-8
      conteudoBase64Ansi,  // download fiel (latin1/ANSI)
    };
  }

  /**
   * MODO FISCAL — gera os lançamentos contábeis A PARTIR DAS NOTAS (XML) da competência.
   * O escritório trabalha com XMLs, não com lançamento manual; por isso a tabela de
   * transações vive vazia e o simulador não gerava nada. Aqui montamos a escrituração:
   *   Venda (saída):  D Clientes  / C Receita   (+ D ICMS s/ vendas / C ICMS a recolher)
   *   Compra (entrada): D Estoque / C Fornecedores
   * O plano de contas é configurável; os defaults são ajustáveis pelo contador.
   */
  async gerarLancamentosFiscais(input: {
    companyId: string; mesAno?: string; layout?: Partial<DominioLayout>; plano?: Partial<PlanoContas>;
  }) {
    if (!input.companyId) throw new BadRequestException('companyId obrigatório');
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    const layout: DominioLayout = { ...LAYOUT_PADRAO, ...(input.layout ?? {}) };
    const contas: PlanoContas = { ...PLANO_PADRAO, ...(input.plano ?? {}) };

    const where: any = { companyId: input.companyId, extractedData: { not: null }, issueDate: { not: null } };
    if (input.mesAno) {
      const [y, m] = input.mesAno.split('-').map(Number);
      where.issueDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
    const docs = await this.prisma.document.findMany({ where, orderBy: { issueDate: 'asc' } });

    const linhas: LinhaLancamento[] = [];
    const avisos: string[] = [];
    let notasOk = 0, semValor = 0;
    for (const d of docs) {
      const nf = safeJson(d.extractedData);
      const data = d.issueDate as Date;
      const valor = round(nf?.valorTotal ?? nf?.totais?.produtos ?? d.totalValue ?? 0);
      if (!data || valor <= 0.005) { semValor++; continue; }
      const cfop = String(nf?.itens?.[0]?.cfop ?? '');
      const dir = cfop[0];
      const saida = ['5', '6', '7'].includes(dir) || (dir === '' && (d.type === 'nfse'));
      const entrada = ['1', '2', '3'].includes(dir);
      const nnf = nf?.numero ? `NF ${nf.numero}` : (d.number ? `NF ${d.number}` : 'NF');
      if (saida) {
        linhas.push({ data, debito: contas.clientes, credito: contas.receita, valor, historico: `Venda ${nnf} - ${nf?.destNome ?? d.recipientName ?? ''}`.trim() });
        const icms = round(nf?.totais?.icms ?? 0);
        if (icms > 0.005) linhas.push({ data, debito: contas.icmsVendas, credito: contas.icmsRecolher, valor: icms, historico: `ICMS s/ ${nnf}` });
        notasOk++;
      } else if (entrada) {
        linhas.push({ data, debito: contas.compras, credito: contas.fornecedores, valor, historico: `Compra ${nnf} - ${nf?.emitenteNome ?? d.issuerName ?? ''}`.trim() });
        notasOk++;
      } else {
        avisos.push(`${nnf}: CFOP ${cfop || '—'} sem direção clara — revisar`);
      }
    }
    if (semValor > 0) avisos.push(`${semValor} nota(s) sem valor/data — ignoradas.`);

    const conteudo = linhas.map(l => this.formatarLinha(l, layout)).join('\r\n');
    const conteudoBase64Ansi = Buffer.from(conteudo, 'latin1').toString('base64');
    return {
      companyId: input.companyId, companyName: company.name, cnpj: company.cnpj,
      fonte: 'fiscal', periodo: input.mesAno ?? 'todos',
      totalTransacoes: docs.length, transacoesExportadas: notasOk, totalLinhas: linhas.length,
      avisos, layout, plano: contas,
      nomeArquivo: `dominio_fiscal_${(company.cnpj || '').replace(/\D/g, '')}_${input.mesAno ?? 'geral'}.txt`,
      conteudo, conteudoBase64Ansi,
    };
  }

  /** Decompõe débitos×créditos em pares válidos (algoritmo guloso por valor). */
  private decomporPartidas(debitos: EntryParsed[], creditos: EntryParsed[]): Array<{ debito: string; credito: string; valor: number }> | null {
    const D = debitos.map(e => ({ conta: e.conta, rem: e.valor }));
    const C = creditos.map(e => ({ conta: e.conta, rem: e.valor }));
    const pares: Array<{ debito: string; credito: string; valor: number }> = [];
    let i = 0, j = 0, guard = 0;
    while (i < D.length && j < C.length) {
      if (guard++ > 10000) return null;
      const amt = round(Math.min(D[i].rem, C[j].rem));
      if (amt > 0.005) pares.push({ debito: D[i].conta, credito: C[j].conta, valor: amt });
      D[i].rem = round(D[i].rem - amt);
      C[j].rem = round(C[j].rem - amt);
      if (D[i].rem <= 0.005) i++;
      if (C[j].rem <= 0.005) j++;
    }
    return pares.length ? pares : null;
  }

  private parseEntries(raw: string): EntryParsed[] {
    let arr: any[] = [];
    try { arr = JSON.parse(raw); } catch { return []; }
    if (!Array.isArray(arr)) return [];
    const out: EntryParsed[] = [];
    for (const e of arr) {
      const conta = String(e.accountCode ?? e.account ?? e.conta ?? '').trim();
      if (!conta) continue;
      const natRaw = String(e.nature ?? e.natureza ?? '').toLowerCase();
      const natureza: 'D' | 'C' = (natRaw.startsWith('d')) ? 'D' : 'C';
      const valor = Number(e.value ?? e.valor ?? 0);
      if (!valor) continue;
      out.push({ conta, natureza, valor });
    }
    return out;
  }

  private formatarLinha(l: LinhaLancamento, layout: DominioLayout): string {
    const valores: Record<string, string> = {
      data: this.fmtData(l.data, layout.dateFormat),
      debito: l.debito,
      credito: l.credito,
      valor: this.fmtValor(l.valor, layout.decimalSep),
      codHistorico: layout.codHistoricoPadrao,
      historico: layout.incluirHistorico ? sanitize(l.historico, layout.separator) : '',
      filial: '',
    };
    return layout.campos.map(c => valores[c] ?? '').join(layout.separator);
  }

  private fmtData(d: Date, fmt: DominioLayout['dateFormat']): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    if (fmt === 'DDMMYYYY') return `${dd}${mm}${yyyy}`;
    if (fmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
    return `${dd}/${mm}/${yyyy}`;
  }

  private fmtValor(v: number, sep: ',' | '.'): string {
    const s = round(v).toFixed(2);
    return sep === ',' ? s.replace('.', ',') : s;
  }
}

function round(n: number): number { return Math.round(n * 100) / 100; }
function sanitize(s: string, sep: string): string {
  return (s ?? '').replace(new RegExp(`[${sep === '|' ? '\\|' : sep}\\r\\n]`, 'g'), ' ').slice(0, 200);
}
