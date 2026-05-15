import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../database/prisma.service';

type AnalyzeBody = {
  companyId: string;
  filename: string;
  // base64 content (without data: prefix)
  base64: string;
  // hint: 'pdf', 'xml', 'image' (sniffed if absent)
  mediaType?: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'application/xml' | 'text/xml';
};

type AnalyzeBatchBody = {
  companyId: string;
  files: Array<Omit<AnalyzeBody, 'companyId'>>;
  // max parallel: default 3 (Anthropic rate-limit friendly)
  concurrency?: number;
};

function detectMediaType(filename: string, declared?: AnalyzeBody['mediaType']): AnalyzeBody['mediaType'] {
  if (declared) return declared;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'xml') return 'application/xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/pdf';
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Persiste resultado vindo do worker Python (legado).
   */
  @Post('ingest')
  @HttpCode(201)
  async ingest(@Body() body: { company_id: string; result: any; source?: string }) {
    return this.documentsService.saveProcessingResult(body.company_id, body.result, body.source);
  }

  /**
   * Analisa UM arquivo enviado em base64. Retorna o Document criado com
   * extracao da IA (Claude Vision para PDF/imagem, prompt fiscal para XML).
   *
   * Body:
   *   { companyId, filename, base64, mediaType? }
   */
  @Post('analyze')
  @HttpCode(201)
  async analyze(@Body() body: AnalyzeBody) {
    if (!body.companyId || !body.base64) {
      return { error: 'companyId e base64 obrigatorios' };
    }
    const mediaType = detectMediaType(body.filename ?? '', body.mediaType);

    // XML: decodifica base64 → string → ai.analisarXmlFiscal
    if (mediaType === 'application/xml' || mediaType === 'text/xml') {
      const xmlContent = Buffer.from(body.base64, 'base64').toString('utf-8');
      const doc = await this.documentsService.processarXmlComIA(body.companyId, xmlContent);
      return { document: doc, filename: body.filename };
    }

    // PDF / imagem: usa Vision
    const doc = await this.documentsService.processarComIA(
      body.companyId,
      body.base64,
      mediaType as any,
    );
    return { document: doc, filename: body.filename };
  }

  /**
   * Analisa N arquivos em paralelo (concorrencia configuravel, default 3).
   * Retorna lista de resultados; arquivos com erro tem `error` no resultado.
   */
  @Post('analyze-batch')
  @HttpCode(201)
  async analyzeBatch(@Body() body: AnalyzeBatchBody) {
    if (!body.companyId || !Array.isArray(body.files) || body.files.length === 0) {
      return { error: 'companyId e files[] obrigatorios' };
    }
    const concurrency = Math.max(1, Math.min(body.concurrency ?? 3, 6));
    const results: Array<{ filename: string; document?: any; error?: string }> = [];

    // pool de promises com concorrencia limitada
    let cursor = 0;
    const worker = async () => {
      while (cursor < body.files.length) {
        const idx = cursor++;
        const f = body.files[idx];
        try {
          const r = await this.analyze({ ...f, companyId: body.companyId });
          results[idx] = { filename: f.filename, document: (r as any).document };
        } catch (e: any) {
          results[idx] = { filename: f.filename, error: e?.message ?? 'erro desconhecido' };
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const ok = results.filter((r) => r.document).length;
    return {
      total: body.files.length,
      processed: ok,
      failed: body.files.length - ok,
      results,
    };
  }

  /**
   * Lista documentos da empresa (com filtros).
   */
  @Get()
  async list(
    @Query('companyId') companyId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    if (!companyId) return [];
    return this.documentsService.findAll(companyId, { type, status });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.documentsService.findById(id);
  }

  @Get('stats/:companyId')
  async stats(@Param('companyId') companyId: string) {
    return this.documentsService.getStats(companyId);
  }

  /**
   * Busca em linguagem natural sobre documentos JA INDEXADOS no banco.
   *
   * Exemplos de queries que funcionam:
   *   - "imposto de 2023 da empresa Padaria"
   *   - "notas fiscais acima de 5000 reais em janeiro"
   *   - "boletos vencidos do CNPJ 12345678000190"
   *   - "DAS dos ultimos 6 meses"
   *
   * Body: { companyId, query }
   * Resposta: { filters, total, results: Document[] }
   */
  @Post('search-natural')
  async searchNatural(@Body() body: { companyId: string; query: string; limit?: number }) {
    if (!body.companyId || !body.query) {
      return { error: 'companyId e query obrigatorios' };
    }
    const filters = await this.ai.parseDocumentSearch(body.query);
    const where: any = { companyId: body.companyId };

    if (filters.type && filters.type.length > 0) {
      where.type = { in: filters.type };
    }
    if (filters.year) {
      const start = new Date(filters.year, (filters.monthStart ?? 1) - 1, 1);
      const end = new Date(filters.year, (filters.monthEnd ?? 12), 0, 23, 59, 59);
      where.issueDate = { gte: start, lte: end };
    }
    if (filters.cnpj) {
      where.issuerCnpj = filters.cnpj.replace(/\D/g, '');
    } else if (filters.issuerKeyword) {
      where.issuerName = { contains: filters.issuerKeyword, mode: 'insensitive' };
    }
    if (filters.minValue !== undefined || filters.maxValue !== undefined) {
      where.totalValue = {};
      if (filters.minValue !== undefined) where.totalValue.gte = filters.minValue;
      if (filters.maxValue !== undefined) where.totalValue.lte = filters.maxValue;
    }

    const results = await this.prisma.document.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      take: body.limit ?? 50,
      select: {
        id: true, type: true, status: true, number: true,
        issueDate: true, dueDate: true, totalValue: true,
        issuerCnpj: true, issuerName: true,
        confidenceScore: true, createdAt: true,
      },
    });

    return {
      query: body.query,
      filters,
      total: results.length,
      results,
    };
  }
}
