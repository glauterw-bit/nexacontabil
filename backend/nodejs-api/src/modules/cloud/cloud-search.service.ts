import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { GoogleDriveService } from './google-drive.service';
import { OneDriveService } from './onedrive.service';

interface NaturalFilters {
  keywords?: string[];
  mimeType?: string;
  startDate?: string;
  endDate?: string;
  cnpj?: string;
  companyName?: string;
  documentTypes?: string[];
}

@Injectable()
export class CloudSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly google: GoogleDriveService,
    private readonly onedrive: OneDriveService,
  ) {}

  /**
   * Busca em TODAS conexoes ativas do escritorio, paralelamente.
   * Usa IA para parsear linguagem natural em filtros estruturados.
   */
  async search(query: string, userId: string, companyId?: string) {
    const start = Date.now();
    const filters = await this.ai.parseDocumentSearch(query);
    const connections = await this.prisma.cloudConnection.findMany({
      where: { active: true },
    });

    const allFiles: any[] = [];
    const errors: string[] = [];

    // termo de busca consolidado
    const keywords = (filters.keywords || []).filter(k => k.length > 2);
    const searchTerm = keywords.length > 0 ? keywords.join(' ') : query.split(' ').slice(0, 3).join(' ');

    for (const conn of connections) {
      try {
        let files: any[] = [];
        if (conn.provider === 'google_drive') {
          files = await this.google.search(conn.id, { q: searchTerm, pageSize: 30 });
        } else if (conn.provider === 'microsoft_onedrive') {
          files = await this.onedrive.search(conn.id, { q: searchTerm, pageSize: 30 });
        }
        allFiles.push(
          ...files.map((f: any) => ({ ...f, _connectionId: conn.id, _provider: conn.provider, _connectionLabel: conn.label })),
        );
      } catch (err: any) {
        errors.push(`${conn.label}: ${err?.message ?? 'erro'}`);
      }
    }

    // pos-filtro por data: usa year + monthStart/End de parseDocumentSearch
    let filtered = allFiles;
    if (filters.year) {
      const ms = filters.monthStart ?? 1;
      const me = filters.monthEnd ?? 12;
      const startTs = new Date(filters.year, ms - 1, 1).getTime();
      const endTs = new Date(filters.year, me, 0, 23, 59, 59).getTime();
      filtered = filtered.filter((f) => {
        const t = new Date(f.modifiedTime || 0).getTime();
        return t >= startTs && t <= endTs;
      });
    }

    // ranking simples por relevancia textual + recência
    filtered.sort((a, b) => {
      const aRel = keywords.reduce((s, k) => s + (a.name?.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0);
      const bRel = keywords.reduce((s, k) => s + (b.name?.toLowerCase().includes(k.toLowerCase()) ? 1 : 0), 0);
      if (aRel !== bRel) return bRel - aRel;
      return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime();
    });

    // grava no historico
    await this.prisma.documentQuery.create({
      data: {
        userId,
        companyId,
        queryText: query,
        parsedFilters: JSON.stringify(filters),
        filesFoundCount: filtered.length,
        durationMs: Date.now() - start,
      },
    });

    return {
      query,
      filters,
      results: filtered.slice(0, 50),
      total: filtered.length,
      errors,
      connectionsScanned: connections.length,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Analisa em lote os arquivos selecionados, gerando relatório com Claude.
   * Cada arquivo é baixado, texto extraído e enviado pro Claude com contexto.
   */
  async analyzeFiles(
    files: Array<{ connectionId: string; fileId: string; name: string }>,
    instruction: string,
    userId: string,
    companyId?: string,
  ) {
    if (files.length === 0) throw new BadRequestException('Selecione pelo menos 1 arquivo');
    if (files.length > 30) throw new BadRequestException('Maximo 30 arquivos por analise');

    const downloaded: Array<{ name: string; mimeType: string; base64: string; size: number }> = [];
    for (const f of files) {
      const conn = await this.prisma.cloudConnection.findUnique({ where: { id: f.connectionId } });
      if (!conn) continue;
      try {
        const dl =
          conn.provider === 'google_drive'
            ? await this.google.downloadFile(f.connectionId, f.fileId)
            : await this.onedrive.downloadFile(f.connectionId, f.fileId);
        if (dl.buffer.length > 25 * 1024 * 1024) {
          downloaded.push({ name: dl.name, mimeType: dl.mimeType, base64: '', size: dl.buffer.length });
          continue;
        }
        downloaded.push({
          name: dl.name,
          mimeType: dl.mimeType,
          base64: dl.buffer.toString('base64'),
          size: dl.buffer.length,
        });
      } catch (err: any) {
        // ignora arquivo com erro, continua os outros
      }
    }

    const individualAnalyses: any[] = [];
    for (const f of downloaded) {
      if (!f.base64) continue;
      try {
        if (f.mimeType === 'application/xml' || f.mimeType === 'text/xml' || f.name.endsWith('.xml')) {
          const xml = Buffer.from(f.base64, 'base64').toString('utf8');
          const extracted = await this.ai.analisarXmlFiscal(xml);
          individualAnalyses.push({ filename: f.name, extracted });
        } else if (
          ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.mimeType)
        ) {
          const extracted = await this.ai.processarDocumento(
            f.base64,
            f.mimeType as any,
          );
          individualAnalyses.push({ filename: f.name, extracted });
        } else {
          individualAnalyses.push({ filename: f.name, error: 'Tipo nao suportado para analise direta' });
        }
      } catch (err: any) {
        individualAnalyses.push({ filename: f.name, error: err?.message });
      }
    }

    // analise consolidada via Claude chat
    const summary = await this.ai.chat(
      `Voce e um contador especialista. Abaixo estao dados extraidos de ${individualAnalyses.length} documento(s).
Aplique esta analise: "${instruction}"

Dados:
${JSON.stringify(individualAnalyses.slice(0, 20), null, 2)}

Responda em portugues, em texto direto, sem usar markdown. Cite numeros especificos e totalize quando fizer sentido.`,
    );

    const report = await this.prisma.generatedReport.create({
      data: {
        companyId,
        userId,
        title: `Analise de ${files.length} arquivo(s)`,
        contentJson: JSON.stringify({
          instruction,
          individualAnalyses,
          summary,
          filesAnalyzed: downloaded.length,
        }),
        format: 'json',
        hash: require('crypto')
          .createHash('sha256')
          .update(JSON.stringify({ summary, count: downloaded.length }))
          .digest('hex'),
      },
    });

    return {
      reportId: report.id,
      summary,
      individualAnalyses,
      filesAnalyzed: downloaded.length,
    };
  }
}
