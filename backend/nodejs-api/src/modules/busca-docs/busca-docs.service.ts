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

    // Cliente: SÓ o campo explícito da IA — nunca uma keyword solta
    // (senão "notas com erro" vira busca por cliente chamado "erro").
    // E nunca um termo fiscal: a IA às vezes joga "ICMS"/"nota" no issuerKeyword.
    const STOP = new Set(['icms', 'ipi', 'pis', 'cofins', 'iss', 'st', 'das', 'darf',
      'imposto', 'impostos', 'tributo', 'tributacao', 'nota', 'notas', 'nfe', 'nf-e',
      'nfse', 'documento', 'documentos', 'inconsistencia', 'inconsistencias', 'erro',
      'erros', 'divergencia', 'divergencias', 'problema', 'fiscal', 'cfop', 'ncm']);
    let companyIds: string[] | undefined;
    let clienteMatches: { id: string; name: string }[] = [];
    let termoCliente = (f.issuerKeyword || '').trim();
    if (termoCliente && STOP.has(termoCliente.toLowerCase())) termoCliente = '';
    const pediuCliente = termoCliente.length >= 3;
    if (pediuCliente) {
      clienteMatches = await this.prisma.company.findMany({
        where: { name: { contains: termoCliente, mode: 'insensitive' } },
        select: { id: true, name: true },
        take: 30,
      });
      if (clienteMatches.length) companyIds = clienteMatches.map((c) => c.id);
    }

    const where: any = {};
    if (companyIds) {
      where.companyId = { in: companyIds };
    } else if (pediuCliente) {
      // não achou empresa: tenta casar pelo emitente/destinatário nos próprios docs
      where.OR = [
        { issuerName: { contains: termoCliente, mode: 'insensitive' } },
        { recipientName: { contains: termoCliente, mode: 'insensitive' } },
      ];
    }
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

    // ordena por relevância: valor desc quando o usuário falou em valor,
    // senão por data (mais recente primeiro)
    const orderBy: any = (f.minValue != null || f.maxValue != null)
      ? { totalValue: 'desc' }
      : { issueDate: 'desc' };

    // Quando filtra por inconsistência (fiscalValidation é JSON, não dá pra
    // filtrar no SQL), precisamos varrer TODOS os candidatos — senão notas
    // com erro fora da janela mais recente somem. Sem extractedData p/ aliviar.
    const docs = await this.prisma.document.findMany({
      where, orderBy,
      ...(soComInconsist
        ? { select: { id: true, companyId: true, originalFilename: true, number: true, totalValue: true, issueDate: true, issuerName: true, type: true, fiscalValidation: true } }
        : { take: 200 }),
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

    // DEDUP: mesma nota não aparece duas vezes (por arquivo, ou nº+valor+cliente)
    const vistos = new Set<string>();
    const unicos = todos.filter((r) => {
      const k = r.arquivo || `${r.cliente}|${r.numero}|${r.valor}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    const resultados = unicos.slice(0, 50);

    // totais sobre TODO o conjunto encontrado (não só os 50 exibidos)
    let valorTotal = 0, comInconsist = 0;
    for (const r of unicos) {
      valorTotal += r.valor ?? 0;
      if (r.inconsistencias.length) comInconsist++;
    }

    return {
      consulta: query,
      filtrosInterpretados: f,
      filtroInconsistencia: soComInconsist,
      clienteBuscado: pediuCliente ? termoCliente : null,
      clientesEncontrados: clienteMatches.map((c) => c.name),
      clienteNaoEncontrado: pediuCliente && !companyIds && unicos.length === 0,
      encontrados: resultados.length,
      totalDisponivel: unicos.length,
      truncado: unicos.length > 50,
      valorTotal: Math.round(valorTotal * 100) / 100,
      comInconsistencia: comInconsist,
      resultados,
    };
  }
}

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
