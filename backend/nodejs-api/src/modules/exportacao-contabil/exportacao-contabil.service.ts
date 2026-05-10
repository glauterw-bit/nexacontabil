import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ExportacaoContabilService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── OFX ────────────────────────────────────────────────────
  async exportarOFX(companyId: string, dateFrom: Date, dateTo: Date): Promise<string> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: { gte: dateFrom, lte: dateTo },
        status: { not: 'draft' },
      },
      orderBy: { date: 'asc' },
    });

    const empresa = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true },
    });

    const now = new Date();
    const dtAsof = this._formatDateOFX(dateTo);
    const dtServer = this._formatDateOFXFull(now);

    const stmtTrns = transactions
      .map(t => {
        const trnType = t.totalCredit > t.totalDebit ? 'CREDIT' : 'DEBIT';
        const amount = t.totalCredit > t.totalDebit ? t.totalCredit : -t.totalDebit;
        return [
          '<STMTTRN>',
          `<TRNTYPE>${trnType}`,
          `<DTPOSTED>${this._formatDateOFXFull(t.date)}`,
          `<TRNAMT>${amount.toFixed(2)}`,
          `<FITID>${t.id.replace(/-/g, '').substring(0, 16)}`,
          `<MEMO>${this._sanitizeOFX(t.description).substring(0, 255)}`,
          '</STMTTRN>',
        ].join('\n');
      })
      .join('\n');

    const ofx = [
      'OFXHEADER:100',
      'DATA:OFXSGML',
      'VERSION:102',
      'SECURITY:NONE',
      'ENCODING:USASCII',
      'CHARSET:1252',
      'COMPRESSION:NONE',
      'OLDFILEUID:NONE',
      'NEWFILEUID:NONE',
      '',
      '<OFX>',
      '<SIGNONMSGSRSV1>',
      '<SONRS>',
      '<STATUS>',
      '<CODE>0',
      '<SEVERITY>INFO',
      '</STATUS>',
      `<DTSERVER>${dtServer}`,
      '<LANGUAGE>POR',
      '</SONRS>',
      '</SIGNONMSGSRSV1>',
      '<BANKMSGSRSV1>',
      '<STMTTRNRS>',
      '<TRNUID>1001',
      '<STATUS>',
      '<CODE>0',
      '<SEVERITY>INFO',
      '</STATUS>',
      '<STMTRS>',
      '<CURDEF>BRL',
      '<BANKACCTFROM>',
      `<BANKID>${empresa?.cnpj || ''}`,
      `<ACCTID>${companyId.substring(0, 22)}`,
      '<ACCTTYPE>CHECKING',
      '</BANKACCTFROM>',
      '<BANKTRANLIST>',
      `<DTSTART>${this._formatDateOFXFull(dateFrom)}`,
      `<DTEND>${dtAsof}`,
      stmtTrns,
      '</BANKTRANLIST>',
      '<LEDGERBAL>',
      `<BALAMT>${transactions.reduce((s, t) => s + t.totalCredit - t.totalDebit, 0).toFixed(2)}`,
      `<DTASOF>${dtAsof}`,
      '</LEDGERBAL>',
      '</STMTRS>',
      '</STMTTRNRS>',
      '</BANKMSGSRSV1>',
      '</OFX>',
    ].join('\n');

    return ofx;
  }

  // ─── CSV ─────────────────────────────────────────────────────
  async exportarCSV(
    companyId: string,
    dateFrom: Date,
    dateTo: Date,
    formato: 'dominio' | 'alterdata' | 'generico' = 'generico',
  ): Promise<string> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: { gte: dateFrom, lte: dateTo },
      },
      orderBy: { date: 'asc' },
    });

    const empresa = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true },
    });

    if (formato === 'dominio') {
      return this._gerarCSVDominio(transactions, empresa);
    } else if (formato === 'alterdata') {
      return this._gerarCSVAlterdata(transactions, empresa);
    } else {
      return this._gerarCSVGenerico(transactions, empresa);
    }
  }

  private _gerarCSVDominio(transactions: any[], empresa: any): string {
    const cabecalho = 'Data;Histórico;Débito;Crédito;Conta Contábil;CNPJ';
    const linhas = transactions.map(t => {
      const data = new Date(t.date).toLocaleDateString('pt-BR');
      const historico = this._sanitizeCSV(t.description);
      const debito = t.totalDebit > 0 ? t.totalDebit.toFixed(2).replace('.', ',') : '';
      const credito = t.totalCredit > 0 ? t.totalCredit.toFixed(2).replace('.', ',') : '';
      const conta = '1.1.1.01'; // Conta padrão stub
      const cnpj = empresa?.cnpj || '';
      return `${data};${historico};${debito};${credito};${conta};${cnpj}`;
    });

    return [cabecalho, ...linhas].join('\n');
  }

  private _gerarCSVAlterdata(transactions: any[], empresa: any): string {
    const cabecalho = 'DATA;HISTORICO;VALOR;TIPO;EMPRESA;CNPJ';
    const linhas = transactions.map(t => {
      const data = new Date(t.date).toLocaleDateString('pt-BR');
      const historico = this._sanitizeCSV(t.description);
      const valor = (t.totalCredit > t.totalDebit ? t.totalCredit : t.totalDebit).toFixed(2).replace('.', ',');
      const tipo = t.totalCredit > t.totalDebit ? 'C' : 'D';
      const empresa_nome = this._sanitizeCSV(empresa?.name || '');
      const cnpj = empresa?.cnpj || '';
      return `${data};${historico};${valor};${tipo};${empresa_nome};${cnpj}`;
    });

    return [cabecalho, ...linhas].join('\n');
  }

  private _gerarCSVGenerico(transactions: any[], empresa: any): string {
    const cabecalho = 'ID;Data;Descrição;Débito;Crédito;Status;CompanyId';
    const linhas = transactions.map(t => {
      const data = new Date(t.date).toISOString().split('T')[0];
      const descricao = this._sanitizeCSV(t.description);
      const debito = t.totalDebit.toFixed(2);
      const credito = t.totalCredit.toFixed(2);
      return `${t.id};${data};${descricao};${debito};${credito};${t.status};${t.companyId}`;
    });

    return [cabecalho, ...linhas].join('\n');
  }

  // ─── SPED ECD ────────────────────────────────────────────────
  async exportarSPEDContabil(companyId: string, ano: number): Promise<string> {
    const empresa = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true, ie: true, municipio: true, uf: true, responsavel: true, crc: true },
    });

    if (!empresa) throw new Error('Empresa não encontrada');

    const cnpj = (empresa.cnpj || '').replace(/\D/g, '');
    const dtIni = `${ano}0101`;
    const dtFin = `${ano}1231`;
    const hoje = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 8);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: {
          gte: new Date(`${ano}-01-01`),
          lte: new Date(`${ano}-12-31`),
        },
        status: 'approved',
      },
      orderBy: { date: 'asc' },
    });

    const linhas: string[] = [];

    // Bloco 0 — Abertura
    linhas.push(`|0000|ECD|${dtIni}|${dtFin}|${empresa.name}|${cnpj}||${empresa.uf || ''}|${empresa.municipio || ''}||2|N|`);
    linhas.push(`|0001|0|`);
    linhas.push(`|0007|${cnpj}|`);
    linhas.push(`|0150|001|${empresa.name}|${cnpj}|||${empresa.ie || ''}||||${empresa.municipio || ''}|${empresa.uf || ''}|`);
    linhas.push(`|0990|5|`);

    // Bloco I — Lançamentos
    linhas.push(`|I001|0|`);
    linhas.push(`|I010|${cnpj}|${empresa.name}|1|`);
    linhas.push(`|I050|1.1.1.01|01|Caixa|1|Caixa e Equivalentes de Caixa|`);
    linhas.push(`|I100|${dtIni}|${dtFin}|0,00|0,00|0,00|0,00|0,00|0,00|`);

    let seqLanc = 1;
    for (const t of transactions) {
      const dtLanc = new Date(t.date).toLocaleDateString('pt-BR').replace(/\//g, '');
      const hist = this._sanitizeSPED(t.description).substring(0, 60);
      linhas.push(`|I200|${String(seqLanc).padStart(6, '0')}|${dtLanc}|${hist}|`);
      seqLanc++;
    }

    linhas.push(`|I990|${seqLanc + 5}|`);

    // Bloco J — Demonstrações
    linhas.push(`|J001|0|`);
    linhas.push(`|J050|${dtIni}|${dtFin}|Balanço Patrimonial||`);
    linhas.push(`|J990|3|`);

    // Bloco 9 — Encerramento
    linhas.push(`|9001|0|`);
    linhas.push(`|9900|0000|2|`);
    linhas.push(`|9900|I001|${seqLanc + 4}|`);
    linhas.push(`|9900|J001|3|`);
    linhas.push(`|9900|9001|4|`);
    linhas.push(`|9999|${linhas.length + 2}|`);

    return linhas.join('\n');
  }

  // ─── Helpers ─────────────────────────────────────────────────
  private _formatDateOFX(date: Date): string {
    return new Date(date).toISOString().replace(/[-:T.Z]/g, '').substring(0, 8) + '120000';
  }

  private _formatDateOFXFull(date: Date): string {
    return new Date(date).toISOString().replace(/[-:.TZ]/g, '').substring(0, 14);
  }

  private _sanitizeOFX(str: string): string {
    return str.replace(/[<>&]/g, '').trim();
  }

  private _sanitizeCSV(str: string): string {
    return `"${(str || '').replace(/"/g, '""').trim()}"`;
  }

  private _sanitizeSPED(str: string): string {
    return (str || '')
      .replace(/\|/g, '-')
      .replace(/[^\w\s\-.,]/g, '')
      .trim();
  }
}
