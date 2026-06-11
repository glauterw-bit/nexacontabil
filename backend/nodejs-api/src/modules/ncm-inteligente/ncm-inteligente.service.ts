import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

export interface Divergencia {
  campo: string;
  esperado: string | number;
  encontrado: string | number;
  severidade: 'alta' | 'media' | 'baixa';
}

export interface ValidacaoTributaria {
  ok: boolean;
  ncm: string;
  segmento: string;
  regraEncontrada: boolean;
  divergencias: Divergencia[];
  sugestao?: any;
}

const SEGMENTOS = ['comercio', 'industria', 'servico', 'transporte', 'outro'];

@Injectable()
export class NcmInteligenteService {
  private readonly logger = new Logger(NcmInteligenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ─── CRUD / listagem ────────────────────────────────────────────────

  async listar(filtros?: { segmento?: string; busca?: string; origem?: string }) {
    const where: any = { ativo: true };
    if (filtros?.segmento) where.segmento = filtros.segmento;
    if (filtros?.origem) where.origem = filtros.origem;
    if (filtros?.busca) {
      where.OR = [
        { ncm: { contains: filtros.busca } },
        { descricao: { contains: filtros.busca, mode: 'insensitive' } },
      ];
    }
    return this.prisma.ncmSegmentoRule.findMany({
      where,
      orderBy: [{ usosContador: 'desc' }, { ncm: 'asc' }],
      take: 500,
    });
  }

  async upsert(input: {
    ncm: string; descricao: string; segmento: string;
    icmsAliquota?: number; icmsCst?: string; icmsSt?: boolean; mvaSt?: number;
    ipiAliquota?: number; ipiCst?: string;
    pisAliquota?: number; pisCst?: string; cofinsAliquota?: number; cofinsCst?: string;
    cfopPadrao?: string; regraPorEstado?: any; observacao?: string; origem?: string;
  }) {
    const ncm = (input.ncm || '').replace(/\D/g, '');
    if (ncm.length !== 8) throw new BadRequestException('NCM deve ter 8 dígitos');
    if (!SEGMENTOS.includes(input.segmento)) throw new BadRequestException(`Segmento inválido. Use: ${SEGMENTOS.join(', ')}`);

    return this.prisma.ncmSegmentoRule.upsert({
      where: { ncm_segmento: { ncm, segmento: input.segmento } },
      create: {
        ncm,
        descricao: input.descricao,
        segmento: input.segmento,
        icmsAliquota: input.icmsAliquota ?? 0,
        icmsCst: input.icmsCst,
        icmsSt: input.icmsSt ?? false,
        mvaSt: input.mvaSt ?? 0,
        ipiAliquota: input.ipiAliquota ?? 0,
        ipiCst: input.ipiCst,
        pisAliquota: input.pisAliquota ?? 0,
        pisCst: input.pisCst,
        cofinsAliquota: input.cofinsAliquota ?? 0,
        cofinsCst: input.cofinsCst,
        cfopPadrao: input.cfopPadrao,
        regraPorEstado: input.regraPorEstado ? JSON.stringify(input.regraPorEstado) : null,
        observacao: input.observacao,
        origem: input.origem ?? 'manual',
      },
      update: {
        descricao: input.descricao,
        icmsAliquota: input.icmsAliquota,
        icmsCst: input.icmsCst,
        icmsSt: input.icmsSt,
        mvaSt: input.mvaSt,
        ipiAliquota: input.ipiAliquota,
        ipiCst: input.ipiCst,
        pisAliquota: input.pisAliquota,
        pisCst: input.pisCst,
        cofinsAliquota: input.cofinsAliquota,
        cofinsCst: input.cofinsCst,
        cfopPadrao: input.cfopPadrao,
        regraPorEstado: input.regraPorEstado ? JSON.stringify(input.regraPorEstado) : undefined,
        observacao: input.observacao,
      },
    });
  }

  async bulkUpsert(rules: any[]) {
    let created = 0, updated = 0, errors = 0;
    for (const r of rules) {
      try {
        const before = await this.prisma.ncmSegmentoRule.findUnique({
          where: { ncm_segmento: { ncm: (r.ncm || '').replace(/\D/g, ''), segmento: r.segmento } },
        });
        await this.upsert(r);
        before ? updated++ : created++;
      } catch { errors++; }
    }
    return { total: rules.length, created, updated, errors };
  }

  // ─── Lookup (melhor match) ──────────────────────────────────────────

  async lookup(ncm: string, segmento?: string, uf?: string) {
    const code = (ncm || '').replace(/\D/g, '');
    // 1. match exato ncm+segmento
    let rule = segmento
      ? await this.prisma.ncmSegmentoRule.findUnique({ where: { ncm_segmento: { ncm: code, segmento } } })
      : null;
    // 2. qualquer segmento, prioriza mais usado
    if (!rule) {
      rule = await this.prisma.ncmSegmentoRule.findFirst({
        where: { ncm: code, ativo: true },
        orderBy: { usosContador: 'desc' },
      });
    }
    if (!rule) return null;
    // aplica regra estadual se houver
    const estadual = uf && rule.regraPorEstado ? safeJSON(rule.regraPorEstado)?.[uf.toUpperCase()] : null;
    return { ...rule, regraEstadualAplicada: estadual ?? null };
  }

  // ─── Validação tributária de um item ────────────────────────────────

  async validarTributacao(input: {
    ncm: string; segmento?: string; uf?: string;
    icmsAliquota?: number; ipiAliquota?: number;
    pisAliquota?: number; cofinsAliquota?: number; cfop?: string;
  }): Promise<ValidacaoTributaria> {
    const segmento = input.segmento ?? 'comercio';
    const rule: any = await this.lookup(input.ncm, segmento, input.uf);
    const divergencias: Divergencia[] = [];

    if (!rule) {
      return { ok: false, ncm: input.ncm, segmento, regraEncontrada: false, divergencias };
    }

    const est = rule.regraEstadualAplicada;
    const icmsEsperado = est?.icms ?? rule.icmsAliquota;

    cmp('ICMS', icmsEsperado, input.icmsAliquota, 'alta', divergencias);
    cmp('IPI', rule.ipiAliquota, input.ipiAliquota, 'media', divergencias);
    cmp('PIS', rule.pisAliquota, input.pisAliquota, 'media', divergencias);
    cmp('COFINS', rule.cofinsAliquota, input.cofinsAliquota, 'media', divergencias);
    if (input.cfop && rule.cfopPadrao && input.cfop !== rule.cfopPadrao) {
      divergencias.push({ campo: 'CFOP', esperado: rule.cfopPadrao, encontrado: input.cfop, severidade: 'baixa' });
    }

    return {
      ok: divergencias.length === 0,
      ncm: input.ncm,
      segmento,
      regraEncontrada: true,
      divergencias,
    };
  }

  // ─── Aprendizado: varre XMLs de todos os clientes e monta a base ────
  /**
   * Levanta os NCMs realmente usados nos XMLs capturados + notas fiscais,
   * agrupa por segmento (derivado do CNAE/segmentoFiscal do cliente) e
   * popula/atualiza a base com origem=aprendido_xml, incrementando usos.
   */
  async aprenderDeXmls(): Promise<{ ncmsDescobertos: number; regrasCriadas: number; regrasAtualizadas: number }> {
    const capturas = await this.prisma.xmlCapture.findMany({
      where: { xmlContent: { not: '' } },
      select: { xmlContent: true, companyId: true },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });

    // mapa: companyId -> segmento
    const companies = await this.prisma.company.findMany({
      select: { id: true, segmentoFiscal: true, cnaeCode: true },
    });
    const segByCompany = new Map<string, string>();
    for (const c of companies) segByCompany.set(c.id, c.segmentoFiscal ?? segmentoFromCnae(c.cnaeCode));

    // agrega NCM -> { segmento -> { icms, ipi, pis, cofins, cfop, descricao, count } }
    const agg = new Map<string, Map<string, any>>();
    for (const cap of capturas) {
      const itens = extrairItensNcm(cap.xmlContent);
      const seg = segByCompany.get(cap.companyId) ?? 'comercio';
      for (const it of itens) {
        if (!it.ncm || it.ncm.length !== 8) continue;
        if (!agg.has(it.ncm)) agg.set(it.ncm, new Map());
        const bySeg = agg.get(it.ncm)!;
        const cur = bySeg.get(seg) ?? { icms: [], ipi: [], pis: [], cofins: [], cfops: {}, descricao: it.descricao, count: 0 };
        if (it.icms != null) cur.icms.push(it.icms);
        if (it.ipi != null) cur.ipi.push(it.ipi);
        if (it.pis != null) cur.pis.push(it.pis);
        if (it.cofins != null) cur.cofins.push(it.cofins);
        if (it.cfop) cur.cfops[it.cfop] = (cur.cfops[it.cfop] ?? 0) + 1;
        cur.count++;
        if (!cur.descricao && it.descricao) cur.descricao = it.descricao;
        bySeg.set(seg, cur);
      }
    }

    let regrasCriadas = 0, regrasAtualizadas = 0;
    for (const [ncm, bySeg] of agg) {
      for (const [seg, data] of bySeg) {
        const cfopPadrao = Object.entries(data.cfops).sort((a: any, b: any) => b[1] - a[1])[0]?.[0];
        const existing = await this.prisma.ncmSegmentoRule.findUnique({
          where: { ncm_segmento: { ncm, segmento: seg } },
        });
        const payload = {
          icmsAliquota: moda(data.icms),
          ipiAliquota: moda(data.ipi),
          pisAliquota: moda(data.pis),
          cofinsAliquota: moda(data.cofins),
          cfopPadrao: cfopPadrao ?? undefined,
          descricao: data.descricao || `NCM ${ncm}`,
        };
        if (existing) {
          await this.prisma.ncmSegmentoRule.update({
            where: { id: existing.id },
            data: { usosContador: { increment: data.count }, ...(existing.origem === 'aprendido_xml' ? payload : {}) },
          });
          regrasAtualizadas++;
        } else {
          await this.prisma.ncmSegmentoRule.create({
            data: {
              ncm, segmento: seg, ...payload,
              origem: 'aprendido_xml', confianca: Math.min(0.95, 0.5 + data.count * 0.05),
              usosContador: data.count,
            },
          });
          regrasCriadas++;
        }
      }
    }
    return { ncmsDescobertos: agg.size, regrasCriadas, regrasAtualizadas };
  }

  /**
   * Aprende dos Documentos JÁ analisados (extractedData = NF parseada).
   * Popula o Banco de NCM com os NCMs REAIS de vocês + a tributação que
   * apareceu nas notas + contagem de uso.
   */
  async aprenderDeDocumentos(): Promise<{ ncmsDescobertos: number; regrasCriadas: number; regrasAtualizadas: number; documentos: number }> {
    const docs = await this.prisma.document.findMany({
      where: { extractedData: { not: null } },
      select: { companyId: true, extractedData: true },
      take: 20000,
    });
    const companies = await this.prisma.company.findMany({ select: { id: true, segmentoFiscal: true, cnaeCode: true } });
    const segByCompany = new Map<string, string>();
    for (const c of companies) segByCompany.set(c.id, c.segmentoFiscal ?? segmentoFromCnae(c.cnaeCode));

    const agg = new Map<string, Map<string, any>>();
    for (const doc of docs) {
      let nf: any;
      try { nf = JSON.parse(doc.extractedData as string); } catch { continue; }
      const itens: any[] = Array.isArray(nf?.itens) ? nf.itens : [];
      const seg = segByCompany.get(doc.companyId) ?? 'comercio';
      for (const it of itens) {
        const ncm = String(it.ncm ?? '').replace(/\D/g, '');
        if (ncm.length !== 8) continue;
        if (!agg.has(ncm)) agg.set(ncm, new Map());
        const bySeg = agg.get(ncm)!;
        const cur = bySeg.get(seg) ?? { icms: [], cfops: {}, cfops3: {}, ipi: [], pis: [], cofins: [], descricao: it.descricao, count: 0 };
        const cfop = String(it.cfop ?? '');
        const intra = cfop.startsWith('5'); // saída dentro do estado = ICMS interno padrão
        // ICMS interno aprende SÓ de notas TRIBUTADAS INTEGRALMENTE (CST 00/10)
        // e internas. Exclui ST (60), isento/não-trib (40/41/50/51) e Simples
        // (CSOSN 3 díg) — senão o padrão vira lixo (mistura 0% de ST com 18%).
        const cstA = String(it.cst ?? '').trim();
        const tributadoIntegral = cstA === '00' || cstA === '10';
        if (it.icms != null && intra && tributadoIntegral && Number(it.icms) > 0) cur.icms.push(Number(it.icms));
        if (it.ipi != null) cur.ipi.push(Number(it.ipi));
        if (it.pis != null) cur.pis.push(Number(it.pis));
        if (it.cofins != null) cur.cofins.push(Number(it.cofins));
        if (cfop) { cur.cfops[cfop] = (cur.cfops[cfop] ?? 0) + 1; const c3 = cfop.slice(-3); cur.cfops3[c3] = (cur.cfops3[c3] ?? 0) + 1; }
        cur.count++;
        if (!cur.descricao && it.descricao) cur.descricao = it.descricao;
        bySeg.set(seg, cur);
      }
    }

    let regrasCriadas = 0, regrasAtualizadas = 0;
    for (const [ncm, bySeg] of agg) {
      for (const [seg, data] of bySeg) {
        const cfopPadrao = Object.entries(data.cfops).sort((a: any, b: any) => b[1] - a[1])[0]?.[0];
        const existing = await this.prisma.ncmSegmentoRule.findUnique({ where: { ncm_segmento: { ncm, segmento: seg } } });
        const payload = {
          icmsAliquota: moda(data.icms), ipiAliquota: moda(data.ipi),
          pisAliquota: moda(data.pis), cofinsAliquota: moda(data.cofins),
          cfopPadrao: cfopPadrao ?? undefined, descricao: data.descricao || `NCM ${ncm}`,
        };
        if (existing) {
          await this.prisma.ncmSegmentoRule.update({
            where: { id: existing.id },
            data: { usosContador: { increment: data.count }, ...(existing.origem === 'aprendido_xml' ? payload : {}) },
          });
          regrasAtualizadas++;
        } else {
          await this.prisma.ncmSegmentoRule.create({
            data: { ncm, segmento: seg, ...payload, origem: 'aprendido_xml', confianca: Math.min(0.95, 0.5 + data.count * 0.05), usosContador: data.count },
          });
          regrasCriadas++;
        }
      }
    }
    return { ncmsDescobertos: agg.size, regrasCriadas, regrasAtualizadas, documentos: docs.length };
  }

  /**
   * Enriquece com IA: pros NCMs mais usados, o Claude preenche a tributação
   * correta (CST, ST, MVA, CFOP, observações) — mantém as alíquotas reais
   * observadas e completa o que falta.
   */
  async enriquecerComIA(limit = 15): Promise<{ enriquecidos: number; total: number }> {
    const rules = await this.prisma.ncmSegmentoRule.findMany({
      where: { ativo: true, icmsCst: null }, orderBy: { usosContador: 'desc' }, take: limit,
    });
    let enriquecidos = 0;
    for (const r of rules) {
      try {
        const s = await this.classificarComIA(r.ncm, r.descricao, r.segmento, 'SP');
        await this.prisma.ncmSegmentoRule.update({
          where: { id: r.id },
          data: {
            icmsCst: s.icmsCst ?? undefined, icmsSt: typeof s.icmsSt === 'boolean' ? s.icmsSt : r.icmsSt,
            mvaSt: s.mvaSt ?? r.mvaSt, ipiCst: s.ipiCst ?? undefined,
            cfopPadrao: r.cfopPadrao ?? s.cfopPadrao, observacao: s.observacao ?? undefined,
            confianca: 0.85,
          },
        });
        enriquecidos++;
      } catch { /* segue */ }
    }
    return { enriquecidos, total: rules.length };
  }

  // ─── Classificação assistida por IA ─────────────────────────────────

  async classificarComIA(ncm: string, descricao: string, segmento: string, uf?: string): Promise<any> {
    const prompt = `Você é especialista em tributação fiscal brasileira. Para o produto abaixo, retorne APENAS um JSON com a tributação padrão correta:

NCM: ${ncm}
Descrição: ${descricao}
Segmento da empresa: ${segmento}
UF de operação: ${uf ?? 'SP'}

Retorne:
{
  "icmsAliquota": número (% — alíquota interna típica da UF),
  "icmsCst": "00|20|40|60...",
  "icmsSt": true/false (se o NCM tem substituição tributária),
  "mvaSt": número (% MVA se ST),
  "ipiAliquota": número (% conforme TIPI),
  "ipiCst": "50|99...",
  "pisAliquota": número (0.65 cumulativo ou 1.65 não-cumulativo),
  "cofinsAliquota": número (3.0 ou 7.6),
  "cfopPadrao": "5102|6102...",
  "observacao": "alerta relevante sobre esse NCM (ex: monofásico, ST específica)"
}`;
    const resposta = await this.ai.chat(prompt);
    const json = resposta.match(/\{[\s\S]*\}/);
    if (!json) throw new BadRequestException('IA não retornou JSON válido');
    return JSON.parse(json[0]);
  }

  // ─── Export pra enviar aos clientes / parametrizar sistemas ─────────

  async exportar(formato: 'json' | 'csv' = 'csv', segmento?: string): Promise<{ formato: string; conteudo: string }> {
    const regras = await this.listar(segmento ? { segmento } : undefined);
    if (formato === 'json') {
      return { formato: 'json', conteudo: JSON.stringify(regras, null, 2) };
    }
    const head = 'NCM;Descricao;Segmento;ICMS;CST_ICMS;ST;MVA;IPI;CST_IPI;PIS;COFINS;CFOP;Origem;Usos';
    const linhas = regras.map(r => [
      r.ncm, csvSafe(r.descricao), r.segmento, r.icmsAliquota, r.icmsCst ?? '', r.icmsSt ? 'SIM' : 'NAO',
      r.mvaSt, r.ipiAliquota, r.ipiCst ?? '', r.pisAliquota, r.cofinsAliquota, r.cfopPadrao ?? '',
      r.origem, r.usosContador,
    ].join(';'));
    return { formato: 'csv', conteudo: [head, ...linhas].join('\n') };
  }

  async estatisticas() {
    const [total, porSegmento, aprendidas, comSt] = await Promise.all([
      this.prisma.ncmSegmentoRule.count({ where: { ativo: true } }),
      this.prisma.ncmSegmentoRule.groupBy({ by: ['segmento'], where: { ativo: true }, _count: true }),
      this.prisma.ncmSegmentoRule.count({ where: { ativo: true, origem: 'aprendido_xml' } }),
      this.prisma.ncmSegmentoRule.count({ where: { ativo: true, icmsSt: true } }),
    ]);
    return { total, aprendidas, comSt, porSegmento: porSegmento.map(s => ({ segmento: s.segmento, count: s._count })) };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function cmp(campo: string, esperado: number | undefined, encontrado: number | undefined, sev: Divergencia['severidade'], out: Divergencia[]) {
  if (esperado == null || encontrado == null) return;
  if (Math.abs(esperado - encontrado) > 0.01) {
    out.push({ campo, esperado, encontrado, severidade: sev });
  }
}

function moda(arr: number[]): number {
  if (!arr.length) return 0;
  const freq = new Map<number, number>();
  for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function safeJSON(s: string | null) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
function csvSafe(s: string) { return (s ?? '').replace(/[;\n\r]/g, ' '); }

function segmentoFromCnae(cnae?: string | null): string {
  if (!cnae) return 'comercio';
  const div = parseInt(cnae.replace(/\D/g, '').slice(0, 2), 10);
  if (div >= 10 && div <= 33) return 'industria';
  if (div >= 45 && div <= 47) return 'comercio';
  if (div >= 49 && div <= 53) return 'transporte';
  if (div >= 55) return 'servico';
  return 'comercio';
}

/** Extrai itens com NCM + tributos de um XML de NF-e. Regex-based (sem dep). */
function extrairItensNcm(xml: string): Array<{ ncm: string; descricao?: string; cfop?: string; icms?: number; ipi?: number; pis?: number; cofins?: number }> {
  const itens: any[] = [];
  const prodBlocks = xml.match(/<det[\s\S]*?<\/det>/g) ?? [];
  for (const block of prodBlocks) {
    const ncm = pick(block, 'NCM')?.replace(/\D/g, '');
    if (!ncm) continue;
    itens.push({
      ncm,
      descricao: pick(block, 'xProd'),
      cfop: pick(block, 'CFOP'),
      icms: num(pickAny(block, ['pICMS'])),
      ipi: num(pickAny(block, ['pIPI'])),
      pis: num(pickAny(block, ['pPIS'])),
      cofins: num(pickAny(block, ['pCOFINS'])),
    });
  }
  return itens;
}
function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim();
}
function pickAny(xml: string, tags: string[]): string | undefined {
  for (const t of tags) { const v = pick(xml, t); if (v != null) return v; }
  return undefined;
}
function num(s?: string): number | undefined { if (s == null) return undefined; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; }
