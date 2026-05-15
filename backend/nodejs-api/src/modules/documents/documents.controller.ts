import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';

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
  constructor(private readonly documentsService: DocumentsService) {}

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
}
