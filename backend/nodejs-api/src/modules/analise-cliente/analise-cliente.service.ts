import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OneDriveService } from '../cloud/onedrive.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';

@Injectable()
export class AnaliseClienteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onedrive: OneDriveService,
    private readonly ncm: NcmInteligenteService,
  ) {}

  /**
   * Lê os XMLs da pasta SharePoint do cliente, extrai os dados fiscais,
   * valida a tributação contra o Banco de NCM e salva como Document analisado.
   */
  async analisarCliente(companyId: string, maxFiles = 120) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.sharepointItemId || !company.sharepointDriveId) {
      throw new BadRequestException('Cliente sem pasta do SharePoint vinculada. Rode a importação da carteira primeiro.');
    }
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) throw new BadRequestException('Nenhuma conexão OneDrive ativa.');

    const arquivos = await this.onedrive.coletarArquivos(conn.id, company.sharepointDriveId, company.sharepointItemId, { ext: ['.xml'], maxFiles });

    let analisados = 0, jaExistiam = 0, inconsistencias = 0, ignorados = 0;
    let valorTotal = 0;
    const segmento = company.segmentoFiscal ?? undefined;
    const uf = company.uf ?? undefined;

    for (const f of arquivos) {
      const existing = await this.prisma.document.findFirst({ where: { companyId, originalFilename: f.name } });
      if (existing) { jaExistiam++; continue; }
      try {
        const { buffer } = await this.onedrive.downloadFile(conn.id, f.id, f.driveId);
        const nf = parseNfe(buffer.toString('utf8'));
        if (!nf) { ignorados++; continue; }

        const incs: string[] = [];
        for (const it of nf.itens) {
          if (!it.ncm) continue;
          try {
            const v = await this.ncm.validarTributacao({
              ncm: it.ncm, segmento, uf,
              icmsAliquota: it.icms, ipiAliquota: it.ipi, pisAliquota: it.pis, cofinsAliquota: it.cofins, cfop: it.cfop,
            });
            if (!v.regraEncontrada) incs.push(`NCM ${it.ncm} sem regra no Banco de NCM`);
            else if (!v.ok) for (const d of v.divergencias) incs.push(`NCM ${it.ncm}: ${d.campo} veio ${d.encontrado}% (esperado ${d.esperado}%)`);
          } catch { /* segue */ }
        }
        inconsistencias += incs.length;
        valorTotal += nf.valorTotal ?? 0;

        await this.prisma.document.create({
          data: {
            companyId, type: nf.tipo, status: 'completed', originalFilename: f.name,
            number: nf.numero ? String(nf.numero) : undefined,
            totalValue: nf.valorTotal, issuerName: nf.emitenteNome, issuerCnpj: nf.emitenteCnpj,
            recipientName: nf.destNome, recipientCnpj: nf.destCnpj,
            confidenceScore: 1,
            extractedData: JSON.stringify(nf),
            fiscalValidation: JSON.stringify({ ok: incs.length === 0, inconsistencias: incs }),
            issueDate: nf.dataEmissao ? new Date(nf.dataEmissao) : undefined,
          },
        });
        analisados++;
      } catch { ignorados++; }
    }

    return {
      cliente: company.name,
      arquivosEncontrados: arquivos.length,
      analisados, jaExistiam, ignorados, inconsistencias,
      valorTotal: Math.round(valorTotal * 100) / 100,
    };
  }
}

// ─── Parser de NF-e (regex, sem dependência) ──────────────────
function parseNfe(xml: string): null | {
  tipo: string; numero?: string; chave?: string; dataEmissao?: string; valorTotal?: number;
  emitenteNome?: string; emitenteCnpj?: string; destNome?: string; destCnpj?: string;
  itens: Array<{ ncm: string; descricao?: string; cfop?: string; icms?: number; ipi?: number; pis?: number; cofins?: number }>;
} {
  if (!/<NFe|<nfeProc|<infNFe|<CTe|<NFS|<nfse/i.test(xml)) {
    // não parece XML fiscal conhecido
    if (!/<\?xml/.test(xml)) return null;
  }
  const tipo = /<NFe|infNFe/i.test(xml) ? 'nfe' : /<CTe/i.test(xml) ? 'cte' : /nfse/i.test(xml) ? 'nfse' : 'xml';
  const emitBloco = (xml.match(/<emit>[\s\S]*?<\/emit>/) ?? [''])[0];
  const destBloco = (xml.match(/<dest>[\s\S]*?<\/dest>/) ?? [''])[0];
  const totalBloco = (xml.match(/<ICMSTot>[\s\S]*?<\/ICMSTot>/) ?? [''])[0];

  const itens: any[] = [];
  for (const b of xml.match(/<det[\s\S]*?<\/det>/g) ?? []) {
    const ncm = pick(b, 'NCM')?.replace(/\D/g, '');
    if (!ncm) continue;
    itens.push({
      ncm, descricao: pick(b, 'xProd'), cfop: pick(b, 'CFOP'),
      icms: num(pick(b, 'pICMS')), ipi: num(pick(b, 'pIPI')), pis: num(pick(b, 'pPIS')), cofins: num(pick(b, 'pCOFINS')),
    });
  }

  return {
    tipo,
    numero: pick(xml, 'nNF'),
    chave: (xml.match(/Id="NFe(\d{44})"/) ?? [])[1],
    dataEmissao: pick(xml, 'dhEmi')?.slice(0, 10) ?? pick(xml, 'dEmi'),
    valorTotal: num(pick(totalBloco, 'vNF')),
    emitenteNome: pick(emitBloco, 'xNome'),
    emitenteCnpj: pick(emitBloco, 'CNPJ'),
    destNome: pick(destBloco, 'xNome'),
    destCnpj: pick(destBloco, 'CNPJ'),
    itens,
  };
}
function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim();
}
function num(s?: string): number | undefined { if (s == null) return undefined; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; }
