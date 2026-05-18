import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ImportedRow {
  nome?: string;
  razaoSocial?: string;
  cnpj: string;
  regime?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cnae?: string;
  ie?: string;
  im?: string;
  responsavel?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; cnpj?: string; error: string }>;
  ids: string[];
}

const REGIME_MAP: Record<string, string> = {
  'simples': 'SIMPLES_NACIONAL',
  'simples nacional': 'SIMPLES_NACIONAL',
  'sn': 'SIMPLES_NACIONAL',
  'mei': 'MEI',
  'microempreendedor': 'MEI',
  'presumido': 'LUCRO_PRESUMIDO',
  'lucro presumido': 'LUCRO_PRESUMIDO',
  'lp': 'LUCRO_PRESUMIDO',
  'real': 'LUCRO_REAL',
  'lucro real': 'LUCRO_REAL',
  'lr': 'LUCRO_REAL',
};

@Injectable()
export class MigrationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parse CSV genérico (separador detectado automaticamente).
   * Cabeçalho mínimo aceito: cnpj, razao_social (ou nome), regime, email, telefone
   * Aceita variantes de nomes de coluna.
   */
  parseCsv(content: string): ImportedRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    // detecta separador (vírgula ou ponto-e-vírgula)
    const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

    const idx = {
      cnpj: headers.findIndex((h) => /cnpj/.test(h)),
      razaoSocial: headers.findIndex((h) => /razao|raz_o|nome|empresa/.test(h)),
      regime: headers.findIndex((h) => /regime|tribut/.test(h)),
      email: headers.findIndex((h) => /e?mail/.test(h)),
      telefone: headers.findIndex((h) => /tel|fone|celular/.test(h)),
      endereco: headers.findIndex((h) => /endere|rua|logradouro/.test(h)),
      cnae: headers.findIndex((h) => /cnae|atividade/.test(h)),
      ie: headers.findIndex((h) => /^ie$|inscri_o_estadual|inscricao_estadual/.test(h)),
      im: headers.findIndex((h) => /^im$|inscri_o_municipal|inscricao_municipal/.test(h)),
      responsavel: headers.findIndex((h) => /respons_vel|responsavel|contato/.test(h)),
    };

    if (idx.cnpj === -1) throw new BadRequestException('Coluna CNPJ obrigatória');

    const rows: ImportedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i], sep);
      const cnpj = (cols[idx.cnpj] ?? '').replace(/\D/g, '');
      if (cnpj.length !== 14) continue;
      const r: ImportedRow = {
        cnpj,
        razaoSocial: idx.razaoSocial >= 0 ? cols[idx.razaoSocial] : undefined,
        regime: idx.regime >= 0 ? cols[idx.regime] : undefined,
        email: idx.email >= 0 ? cols[idx.email] : undefined,
        telefone: idx.telefone >= 0 ? cols[idx.telefone] : undefined,
        endereco: idx.endereco >= 0 ? cols[idx.endereco] : undefined,
        cnae: idx.cnae >= 0 ? cols[idx.cnae] : undefined,
        ie: idx.ie >= 0 ? cols[idx.ie] : undefined,
        im: idx.im >= 0 ? cols[idx.im] : undefined,
        responsavel: idx.responsavel >= 0 ? cols[idx.responsavel] : undefined,
      };
      rows.push(r);
    }
    return rows;
  }

  private parseCsvLine(line: string, sep: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === sep && !inQuote) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  }

  private normalizeRegime(r: string | undefined): string {
    if (!r) return 'SIMPLES_NACIONAL';
    return REGIME_MAP[r.toLowerCase().trim()] ?? r.toUpperCase().replace(/\s+/g, '_');
  }

  async importCompanies(csvContent: string, options: { dryRun?: boolean } = {}): Promise<ImportResult> {
    const rows = this.parseCsv(csvContent);
    const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [], ids: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const existing = await this.prisma.company.findUnique({ where: { cnpj: r.cnpj } });
        if (existing) {
          result.skipped++;
          continue;
        }
        if (options.dryRun) {
          result.created++;
          continue;
        }
        const created = await this.prisma.company.create({
          data: {
            name: r.razaoSocial ?? `Empresa ${r.cnpj.slice(0, 8)}`,
            cnpj: r.cnpj,
            taxRegime: this.normalizeRegime(r.regime),
            email: r.email,
            phone: r.telefone,
            address: r.endereco,
            active: true,
          },
        });
        result.created++;
        result.ids.push(created.id);
      } catch (err: any) {
        result.errors.push({ row: i + 2, cnpj: r.cnpj, error: err?.message ?? 'erro' });
      }
    }
    return result;
  }

  /**
   * Parser para arquivo de exportacao do Dominio Sistemas (.txt tipico).
   * Layout fixo com pipes ou tab — heuristica permissiva.
   */
  parseDominioExport(content: string): ImportedRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    const rows: ImportedRow[] = [];
    for (const line of lines) {
      // Detecta linha de empresa com CNPJ (14 digitos consecutivos)
      const m = line.match(/(\d{14})/);
      if (!m) continue;
      const cnpj = m[1];
      // tenta extrair nome — palavras com mais de 5 chars depois do CNPJ
      const after = line.substring(line.indexOf(cnpj) + 14).trim();
      const nome = after.split(/[\|\t]/)[0]?.trim() || `Empresa ${cnpj.slice(0, 8)}`;
      rows.push({ cnpj, razaoSocial: nome, regime: 'SIMPLES_NACIONAL' });
    }
    return rows;
  }

  async importDominio(content: string): Promise<ImportResult> {
    const rows = this.parseDominioExport(content);
    const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [], ids: [] };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const existing = await this.prisma.company.findUnique({ where: { cnpj: r.cnpj } });
        if (existing) { result.skipped++; continue; }
        const created = await this.prisma.company.create({
          data: {
            name: r.razaoSocial!,
            cnpj: r.cnpj,
            taxRegime: 'SIMPLES_NACIONAL',
            active: true,
          },
        });
        result.created++;
        result.ids.push(created.id);
      } catch (err: any) {
        result.errors.push({ row: i + 1, cnpj: r.cnpj, error: err?.message });
      }
    }
    return result;
  }
}
