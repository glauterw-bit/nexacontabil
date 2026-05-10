import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

@Injectable()
export class SpedService {
  constructor(private readonly prisma: PrismaService) {}

  private pipe(...fields: string[]) {
    return '|' + fields.join('|') + '|';
  }

  private fmt(d: Date) {
    return d.toLocaleDateString('pt-BR').replace(/\//g, '');
  }

  private fmtMes(ref: string) {
    // ref = YYYY-MM
    const [y, m] = ref.split('-');
    const first = new Date(+y, +m - 1, 1);
    const last = new Date(+y, +m, 0);
    return { dtIni: this.fmt(first), dtFin: this.fmt(last) };
  }

  // ── EFD ICMS/IPI (SPED Fiscal) ────────────────────────────
  async gerarSpedFiscal(companyId: string, referenceMonth: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const { dtIni, dtFin } = this.fmtMes(referenceMonth);
    const notes = await this.prisma.fiscalNote.findMany({
      where: { companyId, status: 'authorized', issueDate: { gte: new Date(referenceMonth + '-01') } },
    });

    const lines: string[] = [];
    // Bloco 0
    lines.push(this.pipe('0000', '015', '0', dtIni, dtFin, company.name, company.cnpj.replace(/\D/g, ''), company.uf || 'SP', company.ie || '', '0', company.codigoMunicipio || '3550308', '0', '0', '0'));
    lines.push(this.pipe('0001', '0'));
    lines.push(this.pipe('0005', company.name, company.phone || '', company.cnpj.replace(/\D/g, ''), company.ie || '', company.email || ''));
    lines.push(this.pipe('0990', '3'));

    // Bloco C
    lines.push(this.pipe('C001', '0'));
    let cCount = 2;
    for (const note of notes) {
      lines.push(this.pipe('C100', '0', '0', note.recipientCnpjCpf.replace(/\D/g, ''), '55', '00', String(note.number || ''), note.series, note.issueDate ? this.fmt(note.issueDate) : dtIni, '', '1', '', '', String(note.totalValue.toFixed(2)), '0', '0', '0', String(note.totalIcms?.toFixed(2) || '0'), '0', '0', '0', String(note.totalIpi?.toFixed(2) || '0'), '0', '0', '0', note.accessKey || '', ''));
      cCount++;
    }
    lines.push(this.pipe('C990', String(cCount)));

    // Bloco E
    lines.push(this.pipe('E001', '0'));
    lines.push(this.pipe('E100', dtIni, dtFin));
    const totalIcms = notes.reduce((s, n) => s + (n.totalIcms || 0), 0);
    lines.push(this.pipe('E110', '0', '0', '0', String(totalIcms.toFixed(2)), '0', '0', '0', '0', '0', '0', '0', String(totalIcms.toFixed(2)), '0', '0', '0'));
    lines.push(this.pipe('E990', '4'));

    // Bloco H
    lines.push(this.pipe('H001', '0'));
    lines.push(this.pipe('H990', '2'));

    // Bloco 9 (controle)
    lines.push(this.pipe('9001', '0'));
    lines.push(this.pipe('9900', '0000', '1'));
    lines.push(this.pipe('9900', '0001', '1'));
    lines.push(this.pipe('9900', '0990', '1'));
    lines.push(this.pipe('9900', 'C001', '1'));
    lines.push(this.pipe('9900', 'C990', '1'));
    lines.push(this.pipe('9900', 'E001', '1'));
    lines.push(this.pipe('9900', 'E990', '1'));
    lines.push(this.pipe('9900', 'H001', '1'));
    lines.push(this.pipe('9900', 'H990', '1'));
    lines.push(this.pipe('9900', '9001', '1'));
    lines.push(this.pipe('9900', '9900', String(10 + notes.length)));
    const totalLinhas = lines.length + 2;
    lines.push(this.pipe('9990', String(totalLinhas - lines.length + 1)));
    lines.push(this.pipe('9999', String(totalLinhas + 1)));

    const fileContent = lines.join('\r\n');
    const fileHash = createHash('md5').update(fileContent).digest('hex');

    return this.prisma.spedFile.create({
      data: {
        id: randomUUID(),
        companyId,
        tipo: 'sped_fiscal',
        referenceMonth,
        fileContent,
        fileHash,
        linhas: lines.length,
        status: 'gerado',
      },
    });
  }

  // ── EFD Contribuições (PIS/COFINS) ────────────────────────
  async gerarEfdContribuicoes(companyId: string, referenceMonth: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const { dtIni, dtFin } = this.fmtMes(referenceMonth);
    const notes = await this.prisma.fiscalNote.findMany({
      where: { companyId, status: 'authorized', issueDate: { gte: new Date(referenceMonth + '-01') } },
    });
    const totalRec = notes.reduce((s, n) => s + n.totalValue, 0);
    const isPLReal = company.taxRegime === 'lucro_real';
    const pisTax = isPLReal ? 0.0165 : 0.0065;
    const cofinsTax = isPLReal ? 0.076 : 0.03;

    const lines: string[] = [];
    lines.push(this.pipe('0000', '004', '0', dtIni, dtFin, company.name, company.cnpj.replace(/\D/g, ''), company.uf || 'SP', company.ie || '', '0', company.codigoMunicipio || '3550308', '0', isPLReal ? '1' : '0'));
    lines.push(this.pipe('0001', '0'));
    lines.push(this.pipe('0990', '3'));
    lines.push(this.pipe('A001', '1'));
    lines.push(this.pipe('A990', '2'));
    lines.push(this.pipe('C001', '0'));
    let cCount = 2;
    for (const note of notes) {
      lines.push(this.pipe('C010', note.recipientCnpjCpf.replace(/\D/g, ''), '', '', note.type, String(note.number || ''), note.series, note.issueDate ? this.fmt(note.issueDate) : dtIni, '5102', '', String(note.totalValue.toFixed(2)), '0', '0'));
      lines.push(this.pipe('C100', '0', note.recipientCnpjCpf.replace(/\D/g, ''), '55', '00', String(note.number || ''), note.series, note.issueDate ? this.fmt(note.issueDate) : dtIni, '1', String(note.totalValue.toFixed(2))));
      lines.push(this.pipe('C170', '001', '', String(note.totalValue.toFixed(2)), '01', String((note.totalPis || 0).toFixed(2)), '', String((note.totalCofins || 0).toFixed(2)), ''));
      cCount += 3;
    }
    lines.push(this.pipe('C990', String(cCount)));
    lines.push(this.pipe('M001', '0'));
    lines.push(this.pipe('M100', '01', '0', String((totalRec * pisTax).toFixed(2)), '01', String(totalRec.toFixed(2)), '0', '0', '0', '0', '0', '0', '0', dtIni, dtFin, '0'));
    lines.push(this.pipe('M200', String((totalRec * pisTax).toFixed(2)), '0', '0', '0', String((totalRec * pisTax).toFixed(2)), '0'));
    lines.push(this.pipe('M600', '03', '0', String((totalRec * cofinsTax).toFixed(2)), '01', String(totalRec.toFixed(2)), '0', '0', '0', '0', '0', '0', '0', dtIni, dtFin, '0'));
    lines.push(this.pipe('M700', String((totalRec * cofinsTax).toFixed(2)), '0', '0', '0', String((totalRec * cofinsTax).toFixed(2)), '0'));
    lines.push(this.pipe('M990', '7'));
    lines.push(this.pipe('9001', '0'));
    lines.push(this.pipe('9900', '0000', '1'));
    lines.push(this.pipe('9990', String(lines.length + 2)));
    lines.push(this.pipe('9999', String(lines.length + 2)));

    const fileContent = lines.join('\r\n');
    return this.prisma.spedFile.create({
      data: {
        id: randomUUID(), companyId, tipo: 'efd_contribuicoes', referenceMonth,
        fileContent, fileHash: createHash('md5').update(fileContent).digest('hex'),
        linhas: lines.length, status: 'gerado',
      },
    });
  }

  // ── ECF ───────────────────────────────────────────────────
  async gerarEcf(companyId: string, anoBase: number) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const txs = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: new Date(`${anoBase}-01-01`), lte: new Date(`${anoBase}-12-31`) } },
    });
    const totalRec = txs.filter(t => { try { const e = JSON.parse(t.entries); return e.some((x: any) => x.account?.startsWith('3')); } catch { return false; } }).reduce((s, t) => s + t.totalCredit, 0);
    const baseIrpj = totalRec * 0.08;
    const irpj = baseIrpj * 0.15 + Math.max(0, baseIrpj - 240000) * 0.10;
    const csll = totalRec * 0.12 * 0.09;

    const lines: string[] = [];
    lines.push(this.pipe('0000', '0007', '0', `${anoBase}0101`, `${anoBase}1231`, company.name, company.cnpj.replace(/\D/g, ''), '0', company.taxRegime || 'lucro_presumido', '0', '0', '0', '0'));
    lines.push(this.pipe('0001', '0'));
    lines.push(this.pipe('0010', '', '', '', '', '', '', '', '', '', '', ''));
    lines.push(this.pipe('0990', '4'));
    lines.push(this.pipe('C001', '0'));
    lines.push(this.pipe('C050', company.cnpj.replace(/\D/g, ''), company.name, company.uf || 'SP'));
    lines.push(this.pipe('C990', '3'));
    lines.push(this.pipe('E001', '0'));
    lines.push(this.pipe('E010', company.cnpj.replace(/\D/g, ''), company.name));
    lines.push(this.pipe('E015', String(totalRec.toFixed(2)), '0', '0', '0'));
    lines.push(this.pipe('E990', '4'));
    lines.push(this.pipe('N001', '0'));
    lines.push(this.pipe('N620', String(baseIrpj.toFixed(2)), String(irpj.toFixed(2)), '0', '0', '0', String(irpj.toFixed(2))));
    lines.push(this.pipe('N650', String((totalRec * 0.12).toFixed(2)), String(csll.toFixed(2)), '0', '0', String(csll.toFixed(2))));
    lines.push(this.pipe('N990', '4'));
    lines.push(this.pipe('9001', '0'));
    lines.push(this.pipe('9990', String(lines.length + 2)));
    lines.push(this.pipe('9999', String(lines.length + 2)));

    const fileContent = lines.join('\r\n');
    return this.prisma.spedFile.create({
      data: {
        id: randomUUID(), companyId, tipo: 'ecf', referenceMonth: String(anoBase),
        fileContent, fileHash: createHash('md5').update(fileContent).digest('hex'),
        linhas: lines.length, status: 'gerado',
      },
    });
  }

  // ── ECD ───────────────────────────────────────────────────
  async gerarEcd(companyId: string, anoBase: number) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const txs = await this.prisma.transaction.findMany({
      where: { companyId, status: 'approved', date: { gte: new Date(`${anoBase}-01-01`), lte: new Date(`${anoBase}-12-31`) } },
      orderBy: { date: 'asc' },
    });

    const lines: string[] = [];
    lines.push(this.pipe('0000', '002', '0', `${anoBase}0101`, `${anoBase}1231`, company.name, company.cnpj.replace(/\D/g, ''), company.uf || 'SP', company.ie || '', '1', '0', '0'));
    lines.push(this.pipe('0001', '0'));
    lines.push(this.pipe('0007', company.crc || '1SP000000/O-1', company.responsavel || company.name, '1'));
    lines.push(this.pipe('0990', '4'));
    lines.push(this.pipe('I001', '0'));
    lines.push(this.pipe('I010', company.cnpj.replace(/\D/g, ''), '1', `${anoBase}0101`, `${anoBase}1231`, '1', company.name));

    let seq = 1;
    for (const tx of txs) {
      try {
        const entries = JSON.parse(tx.entries);
        lines.push(this.pipe('I050', String(seq++), this.fmt(tx.date), tx.description.slice(0, 60), String(tx.totalDebit.toFixed(2)), String(tx.totalCredit.toFixed(2))));
        for (const e of entries) {
          lines.push(this.pipe('I100', e.account || '1.1.01', e.type === 'debit' ? 'D' : 'C', String(e.amount?.toFixed(2) || '0')));
        }
      } catch { /* skip malformed */ }
    }

    lines.push(this.pipe('I990', String(lines.length - 4)));
    lines.push(this.pipe('J001', '0'));
    lines.push(this.pipe('J005', `${anoBase}1231`, '2', '1', company.name, company.cnpj.replace(/\D/g, '')));
    lines.push(this.pipe('J990', '3'));
    lines.push(this.pipe('9001', '0'));
    lines.push(this.pipe('9990', String(lines.length + 2)));
    lines.push(this.pipe('9999', String(lines.length + 2)));

    const fileContent = lines.join('\r\n');
    return this.prisma.spedFile.create({
      data: {
        id: randomUUID(), companyId, tipo: 'ecd', referenceMonth: String(anoBase),
        fileContent, fileHash: createHash('md5').update(fileContent).digest('hex'),
        linhas: lines.length, status: 'gerado',
      },
    });
  }

  // ── EFD-Reinf ─────────────────────────────────────────────
  async gerarEfdReinf(companyId: string, referenceMonth: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const { dtIni, dtFin } = this.fmtMes(referenceMonth);
    const id = `ID${randomUUID().replace(/-/g, '').toUpperCase()}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.reinf.esocial.gov.br/schemas/treinamento/evtInfoContribuinte/v01_05_01">
  <evtInfoContribuinte Id="${id}">
    <ideEvento>
      <indRetif>1</indRetif>
      <perApur>${referenceMonth.replace('-', '')}</perApur>
      <tpAmb>${process.env.ESOCIAL_AMBIENTE || '2'}</tpAmb>
      <procEmi>1</procEmi>
      <verProc>1.0.0</verProc>
    </ideEvento>
    <ideContri>
      <tpInsc>1</tpInsc>
      <nrInsc>${company.cnpj.replace(/\D/g, '')}</nrInsc>
    </ideContri>
    <infoContri>
      <inclContri>
        <classTrib>03</classTrib>
        <indEmpPR>N</indEmpPR>
      </inclContri>
    </infoContri>
  </evtInfoContribuinte>
</eSocial>`;

    return this.prisma.spedFile.create({
      data: {
        id: randomUUID(), companyId, tipo: 'efd_reinf', referenceMonth,
        fileContent: xml,
        fileHash: createHash('md5').update(xml).digest('hex'),
        linhas: xml.split('\n').length, status: 'gerado',
      },
    });
  }

  async listarArquivos(companyId: string, tipo?: string) {
    return this.prisma.spedFile.findMany({
      where: { companyId, ...(tipo && { tipo }) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipo: true, referenceMonth: true, status: true, linhas: true, fileHash: true, createdAt: true },
    });
  }

  async baixarArquivo(id: string) {
    return this.prisma.spedFile.findUniqueOrThrow({ where: { id } });
  }
}
