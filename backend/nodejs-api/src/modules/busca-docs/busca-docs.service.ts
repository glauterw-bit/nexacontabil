import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class BuscaDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Busca documentos em linguagem natural: "NF da Padaria de maio acima de
   * 1000 reais". A IA interpreta os filtros, o sistema traz os arquivos
   * analisados + a análise fiscal de cada um.
   */
  async buscar(query: string) {
    const f = await this.ai.parseDocumentSearch(query);

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

    const docs = await this.prisma.document.findMany({
      where, orderBy: { issueDate: 'desc' }, take: 60,
    });

    // nome dos clientes
    const ids = [...new Set(docs.map((d) => d.companyId))];
    const cos = await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nomeCo = new Map(cos.map((c) => [c.id, c.name]));

    let valorTotal = 0, comInconsist = 0;
    const resultados = docs.map((d) => {
      const nf = safe(d.extractedData);
      const fv = safe(d.fiscalValidation);
      const inc = fv?.inconsistencias ?? [];
      valorTotal += d.totalValue ?? 0;
      if (inc.length) comInconsist++;
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

    return {
      consulta: query,
      filtrosInterpretados: f,
      encontrados: resultados.length,
      valorTotal: Math.round(valorTotal * 100) / 100,
      comInconsistencia: comInconsist,
      resultados,
    };
  }
}

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
