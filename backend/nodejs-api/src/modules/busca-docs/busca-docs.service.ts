import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { OneDriveService } from '../cloud/onedrive.service';

@Injectable()
export class BuscaDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly onedrive: OneDriveService,
  ) {}

  /**
   * Baixa o XML original do SharePoint. Usa a referência salva (driveId|itemId)
   * quando existe; senão, busca o arquivo pelo nome na pasta do cliente.
   */
  async baixar(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) throw new BadRequestException('Nenhuma conexão OneDrive ativa.');

    let driveId: string | undefined;
    let itemId: string | undefined;

    // caminho rápido: referência salva
    if (doc.fileUrl && doc.fileUrl.includes('|')) {
      [driveId, itemId] = doc.fileUrl.split('|');
    }

    // fallback: busca pelo nome na pasta do cliente (docs antigos sem ref)
    if (!itemId) {
      const company = await this.prisma.company.findUnique({ where: { id: doc.companyId } });
      if (!company?.sharepointDriveId) throw new BadRequestException('Cliente sem pasta do SharePoint.');
      driveId = company.sharepointDriveId;
      const nome = doc.originalFilename ?? '';
      const achados = await this.onedrive.search(conn.id, { q: nome, driveId, pageSize: 25 });
      const match = achados.find((a: any) => a.name === nome) ?? achados.find((a: any) => !a.isFolder);
      if (!match) throw new NotFoundException(`Arquivo "${nome}" não encontrado no SharePoint.`);
      itemId = match.id;
      driveId = match.driveId ?? driveId;
      // salva a ref pra próxima vez ser instantânea
      await this.prisma.document.update({ where: { id: doc.id }, data: { fileUrl: `${driveId}|${itemId}` } }).catch(() => undefined);
    }

    const file = await this.onedrive.downloadFile(conn.id, itemId!, driveId);
    return { buffer: file.buffer, mimeType: file.mimeType || 'application/xml', name: file.name || doc.originalFilename || 'documento.xml' };
  }

  /**
   * Busca documentos em linguagem natural: "NF da Padaria de maio acima de
   * 1000 reais". A IA interpreta os filtros, o sistema traz os arquivos
   * analisados + a análise fiscal de cada um.
   */
  async buscar(query: string) {
    const f = await this.ai.parseDocumentSearch(query);

    // intenção "só os que têm problema" — não vem nos filtros estruturados
    const soComInconsist = /(inconsist|diverg|erro|irregular|problema|errad)/i.test(query);

    // resolve cliente pelo nome (issuerKeyword ou keywords)
    let companyIds: string[] | undefined;
    const termoCliente = f.issuerKeyword || (f.keywords ?? []).find((k) => k.length > 3);
    if (termoCliente) {
      const cos = await this.prisma.company.findMany({
        where: { name: { contains: termoCliente, mode: 'insensitive' } },
        select: { id: true },
        take: 30,
      });
      if (cos.length) companyIds = cos.map((c) => c.id);
    }

    const where: any = {};
    if (companyIds) where.companyId = { in: companyIds };
    if (f.type?.length) {
      const tipos = f.type.map((t) => (t === 'nf-e' ? 'nfe' : t)).filter((t) => ['nfe', 'nfse', 'cte', 'nfce'].includes(t));
      if (tipos.length) where.type = { in: tipos };
    }
    if (f.minValue != null || f.maxValue != null) {
      where.totalValue = {};
      if (f.minValue != null) where.totalValue.gte = f.minValue;
      if (f.maxValue != null) where.totalValue.lte = f.maxValue;
    }
    if (f.year) {
      const ms = f.monthStart ?? 1, me = f.monthEnd ?? 12;
      where.issueDate = { gte: new Date(f.year, ms - 1, 1), lt: new Date(f.year, me, 1) };
    }
    if (f.cnpj) where.OR = [{ issuerCnpj: f.cnpj }, { recipientCnpj: f.cnpj }];

    // se filtrar por inconsistência, buscamos mais (fiscalValidation é JSON,
    // não dá pra filtrar no SQL) e cortamos depois
    const docs = await this.prisma.document.findMany({
      where, orderBy: { issueDate: 'desc' }, take: soComInconsist ? 500 : 60,
    });

    // nome dos clientes
    const ids = [...new Set(docs.map((d) => d.companyId))];
    const cos = await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nomeCo = new Map(cos.map((c) => [c.id, c.name]));

    let todos = docs.map((d) => {
      const nf = safe(d.extractedData);
      const fv = safe(d.fiscalValidation);
      const inc = fv?.inconsistencias ?? [];
      return {
        id: d.id,
        cliente: nomeCo.get(d.companyId),
        arquivo: d.originalFilename,
        tipo: d.type,
        numero: d.number,
        emitente: d.issuerName,
        valor: d.totalValue,
        data: d.issueDate,
        ncms: (nf?.itens ?? []).map((i: any) => i.ncm).filter(Boolean).slice(0, 5),
        impostos: nf?.totais ? { icms: nf.totais.icms, ipi: nf.totais.ipi, pis: nf.totais.pis, cofins: nf.totais.cofins } : null,
        inconsistencias: inc,
      };
    });

    if (soComInconsist) todos = todos.filter((r) => r.inconsistencias.length > 0);
    const resultados = todos.slice(0, 60);

    let valorTotal = 0, comInconsist = 0;
    for (const r of resultados) {
      valorTotal += r.valor ?? 0;
      if (r.inconsistencias.length) comInconsist++;
    }

    return {
      consulta: query,
      filtrosInterpretados: f,
      filtroInconsistencia: soComInconsist,
      encontrados: resultados.length,
      totalDisponivel: todos.length,
      valorTotal: Math.round(valorTotal * 100) / 100,
      comInconsistencia: comInconsist,
      resultados,
    };
  }
}

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
