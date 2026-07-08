import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
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
  async analisarCliente(companyId: string, maxFiles = 120, todos = false) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.sharepointItemId || !company.sharepointDriveId) {
      throw new BadRequestException('Cliente sem pasta do SharePoint vinculada. Rode a importação da carteira primeiro.');
    }
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) throw new BadRequestException('Nenhuma conexão OneDrive ativa.');

    // todos=true → puxa QUALQUER arquivo da pasta; senão XML (nota) + PDF/recibos
    const arquivos = await this.onedrive.coletarArquivos(conn.id, company.sharepointDriveId, company.sharepointItemId, { ext: ['.xml', '.pdf'], maxFiles, todos });

    let analisados = 0, jaExistiam = 0, inconsistencias = 0, ignorados = 0, outros = 0;
    let valorTotal = 0;
    const segmento = company.segmentoFiscal ?? undefined;
    const uf = company.uf ?? undefined;

    // já analisados antes (dedup por nome) — 1 query só
    const existentes = new Set(
      (await this.prisma.document.findMany({ where: { companyId }, select: { originalFilename: true } }))
        .map((d) => d.originalFilename),
    );
    const novos = arquivos.filter((f) => !existentes.has(f.name));
    jaExistiam = arquivos.length - novos.length;

    // NÃO-XML (PDF, recibos): captura a REFERÊNCIA sem baixar o conteúdo — fica
    // listado/baixável e conta no acervo, sem passar pela análise fiscal (que é de XML).
    const ehXml = (n: string) => n.toLowerCase().endsWith('.xml');
    const naoXml = novos.filter((f) => !ehXml(f.name));
    const extDe = (nome: string) => { const p = nome.split('.'); return p.length > 1 ? p.pop()!.toLowerCase().slice(0, 12) : 'arquivo'; };
    for (const f of naoXml) {
      try {
        await this.prisma.document.create({
          data: {
            companyId, type: extDe(f.name), // pdf | jpg | xlsx | docx | ...
            status: 'recebido', originalFilename: f.name,
            fileUrl: `${f.driveId}|${f.id}`, confidenceScore: 0,
            issueDate: f.modified ? new Date(f.modified) : undefined,
          },
        });
        outros++;
      } catch { ignorados++; }
    }

    // XML: baixa + parseia em PARALELO (lotes de 6) — sem perder precisão
    const xmlNovos = novos.filter((f) => ehXml(f.name));
    const CONC = 6;
    for (let i = 0; i < xmlNovos.length; i += CONC) {
      const fatia = xmlNovos.slice(i, i + CONC);
      const parsed = await Promise.all(fatia.map(async (f) => {
        try {
          const { buffer } = await this.onedrive.downloadFile(conn.id, f.id, f.driveId);
          return { f, nf: parseNfe(buffer.toString('utf8')) };
        } catch { return { f, nf: null }; }
      }));
      for (const { f, nf } of parsed) {
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
        try {
          await this.prisma.document.create({
            data: {
              companyId, type: nf.tipo, status: 'completed', originalFilename: f.name,
              fileUrl: `${f.driveId}|${f.id}`, // ref do SharePoint p/ download posterior
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
    }

    // marca a pasta como varrida (mesmo com 0 docs) → não re-tenta
    await this.prisma.company.update({
      where: { id: companyId },
      data: { sharepointAnalisadoEm: new Date(), sharepointDocsCount: analisados + outros + jaExistiam },
    });

    return {
      cliente: company.name,
      arquivosEncontrados: arquivos.length,
      analisados, outros, jaExistiam, ignorados, inconsistencias,
      valorTotal: Math.round(valorTotal * 100) / 100,
    };
  }

  /**
   * Ingesta UM XML avulso (SIEG, e-mail, upload) no MESMO pipeline dos XMLs do drive:
   * parse → validação fiscal contra o Banco de NCM → Document. Dedup pela chave de
   * acesso (44 dígitos); sem chave (ex.: NFS-e municipal), pelo hash do conteúdo.
   * Não depende de SharePoint — serve para qualquer fonte de captura.
   */
  async ingerirXml(companyId: string, xmlString: string, fonte = 'externo'): Promise<{ status: 'novo' | 'duplicado' | 'invalido'; inconsistencias?: number; valor?: number }> {
    const nf = parseNfe(xmlString);
    if (!nf) return { status: 'invalido' };
    const chave = nf.chave || crypto.createHash('md5').update(xmlString).digest('hex');
    const filename = `${chave}.xml`;
    const existe = await this.prisma.document.findFirst({ where: { companyId, originalFilename: filename }, select: { id: true } });
    if (existe) return { status: 'duplicado' };

    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { segmentoFiscal: true, uf: true } });
    const segmento = company?.segmentoFiscal ?? undefined;
    const uf = company?.uf ?? undefined;
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
    try {
      await this.prisma.document.create({
        data: {
          companyId, type: nf.tipo, status: 'completed', originalFilename: filename,
          fileUrl: `${fonte}|${chave}`,
          number: nf.numero ? String(nf.numero) : undefined,
          totalValue: nf.valorTotal, issuerName: nf.emitenteNome, issuerCnpj: nf.emitenteCnpj,
          recipientName: nf.destNome, recipientCnpj: nf.destCnpj,
          confidenceScore: 1,
          extractedData: JSON.stringify(nf),
          fiscalValidation: JSON.stringify({ ok: incs.length === 0, inconsistencias: incs }),
          issueDate: nf.dataEmissao ? new Date(nf.dataEmissao) : undefined,
        },
      });
      return { status: 'novo', inconsistencias: incs.length, valor: nf.valorTotal ?? 0 };
    } catch { return { status: 'invalido' }; }
  }

  /**
   * Analisa um LOTE de clientes ainda NÃO varridos (sharepointAnalisadoEm null).
   * Cada cliente é tentado uma vez só — pasta vazia é marcada e não re-tentada.
   * Chamável repetidamente até zerar.
   */
  async analisarLote(limit = 8, maxFilesPorCliente = 80, incluirInativos = false) {
    const where: any = { sharepointItemId: { not: null }, sharepointAnalisadoEm: null };
    if (!incluirInativos) where.active = true;
    const pendentesTotal = await this.prisma.company.count({ where });
    const lote = await this.prisma.company.findMany({ where, select: { id: true, name: true }, take: limit });

    const detalhes: any[] = [];
    for (const c of lote) {
      try {
        const r = await this.analisarCliente(c.id, maxFilesPorCliente);
        detalhes.push({ cliente: c.name, analisados: r.analisados, inconsistencias: r.inconsistencias });
      } catch (e: any) {
        // marca como tentado mesmo em erro, pra não travar a fila
        await this.prisma.company.update({ where: { id: c.id }, data: { sharepointAnalisadoEm: new Date(), sharepointDocsCount: 0 } }).catch(() => undefined);
        detalhes.push({ cliente: c.name, erro: e?.message ?? 'erro' });
      }
    }
    return {
      processados: lote.length,
      restantes: Math.max(0, pendentesTotal - lote.length),
      detalhes,
    };
  }

  /**
   * SYNC contínuo: re-varre os clientes há mais tempo sem varredura, pegando
   * só XMLs NOVOS (dedup por nome de arquivo em analisarCliente). Pensado
   * para o agendador — lote pequeno, rotação por sharepointAnalisadoEm asc.
   */
  async sincronizarCarteira(limit = 6, maxFilesPorCliente = 250) {
    const lote = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null }, sharepointAnalisadoEm: { not: null } },
      orderBy: { sharepointAnalisadoEm: 'asc' },
      take: limit,
      select: { id: true, name: true },
    });
    const detalhes: any[] = [];
    let novosDocs = 0;
    for (const c of lote) {
      try {
        const r = await this.analisarCliente(c.id, maxFilesPorCliente);
        novosDocs += r.analisados ?? 0;
        if (r.analisados) detalhes.push({ cliente: c.name, novos: r.analisados });
      } catch (e: any) {
        detalhes.push({ cliente: c.name, erro: e?.message ?? 'erro' });
      }
    }
    return { sincronizados: lote.length, novosDocs, detalhes };
  }

  /**
   * RE-VARREDURA PROFUNDA de toda a carteira ativa em uma passada.
   * Processa quem ainda não foi tocado NESTA rodada (sharepointAnalisadoEm < desde),
   * em lotes pequenos e chamável em loop até `restantes` zerar. Usa teto maior
   * porque agora a coleta prioriza os arquivos recentes (busca 2026 de verdade).
   */
  async resyncLote(desde: string, limit = 6, maxFilesPorCliente = 100000) {
    const cutoff = new Date(desde);
    const where: any = {
      active: true, sharepointItemId: { not: null },
      OR: [{ sharepointAnalisadoEm: null }, { sharepointAnalisadoEm: { lt: cutoff } }],
    };
    const pendentes = await this.prisma.company.count({ where });
    const lote = await this.prisma.company.findMany({
      where, orderBy: { sharepointAnalisadoEm: 'asc' }, take: limit,
      select: { id: true, name: true },
    });
    let novosDocs = 0;
    const detalhes: any[] = [];
    for (const c of lote) {
      try {
        // resync profundo puxa TODO e QUALQUER arquivo (todos=true), sem filtro de tipo
        const r = await this.analisarCliente(c.id, maxFilesPorCliente, true);
        novosDocs += (r.analisados ?? 0) + (r.outros ?? 0);
        if ((r.analisados ?? 0) + (r.outros ?? 0) > 0) detalhes.push({ cliente: c.name, notas: r.analisados, outros: r.outros });
      } catch (e: any) {
        // marca como tocado nesta rodada mesmo em erro, pra não travar o loop
        await this.prisma.company.update({ where: { id: c.id }, data: { sharepointAnalisadoEm: new Date() } }).catch(() => undefined);
        detalhes.push({ cliente: c.name, erro: e?.message ?? 'erro' });
      }
    }
    return { processados: lote.length, restantes: Math.max(0, pendentes - lote.length), novosDocs, detalhes };
  }

  /** Diagnóstico do acervo JÁ CAPTURADO: por tipo, por ano de emissão (inclui sem-data)
   *  e os documentos mais recentes por data de ingestão. Responde "temos 2026?". */
  async diagnostico() {
    const docs = await this.prisma.document.findMany({
      select: { type: true, issueDate: true, createdAt: true, originalFilename: true },
    });
    const porTipo: Record<string, number> = {};
    const porAno: Record<string, number> = {};
    let semData = 0, max: string | null = null, doc2026 = 0;
    for (const d of docs) {
      porTipo[d.type ?? '?'] = (porTipo[d.type ?? '?'] ?? 0) + 1;
      if (d.issueDate) {
        const iso = new Date(d.issueDate).toISOString().slice(0, 10);
        const ano = iso.slice(0, 4);
        porAno[ano] = (porAno[ano] ?? 0) + 1;
        if (!max || iso > max) max = iso;
        if (ano >= '2026') doc2026++;
      } else semData++;
    }
    const recentesIngest = [...docs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 15)
      .map((d) => ({ arquivo: d.originalFilename, tipo: d.type, emissao: d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : null }));
    return { totalDocs: docs.length, porTipo, porAno, semData, maxEmissao: max, docsDe2026: doc2026, recentesIngest };
  }

  /** Progresso da análise da carteira (pra barra de progresso ao vivo). */
  async progresso() {
    const [total, analisados, ativos, ativosFeitos, documentos] = await Promise.all([
      this.prisma.company.count({ where: { sharepointItemId: { not: null } } }),
      this.prisma.company.count({ where: { sharepointItemId: { not: null }, sharepointAnalisadoEm: { not: null } } }),
      this.prisma.company.count({ where: { sharepointItemId: { not: null }, active: true } }),
      this.prisma.company.count({ where: { sharepointItemId: { not: null }, active: true, sharepointAnalisadoEm: { not: null } } }),
      this.prisma.document.count(),
    ]);
    return {
      total, analisados, restantes: total - analisados,
      pct: total ? Math.round((analisados / total) * 100) : 0,
      ativos, ativosAnalisados: ativosFeitos,
      documentos,
      rodando: analisados < total,
    };
  }

  /**
   * Re-valida TODOS os documentos contra o Banco de NCM atual (cheio).
   * Em memória (carrega as regras uma vez) — detecta divergência REAL de
   * tributação, não só "sem regra".
   */
  async revalidarDocumentos() {
    const rules = await this.prisma.ncmSegmentoRule.findMany({
      where: { ativo: true },
      select: { ncm: true, segmento: true, icmsAliquota: true, ipiAliquota: true, pisAliquota: true, cofinsAliquota: true, cfopPadrao: true, icmsSt: true },
    });
    const ruleMap = new Map<string, any[]>();
    for (const r of rules) { const a = ruleMap.get(r.ncm) ?? []; a.push(r); ruleMap.set(r.ncm, a); }

    const companies = await this.prisma.company.findMany({ select: { id: true, segmentoFiscal: true, taxRegime: true } });
    const segBy = new Map(companies.map((c) => [c.id, c.segmentoFiscal]));
    const regimeBy = new Map(companies.map((c) => [c.id, c.taxRegime]));

    const docs = await this.prisma.document.findMany({
      where: { extractedData: { not: null } },
      select: { id: true, companyId: true, extractedData: true },
    });

    let revalidados = 0, comInconsistencia = 0, totalInconsist = 0, semRegra = 0, divergencias = 0;
    for (const d of docs) {
      let nf: any; try { nf = JSON.parse(d.extractedData as string); } catch { continue; }
      const seg = segBy.get(d.companyId);
      const regime = regimeBy.get(d.companyId);
      const incs: string[] = [];
      for (const it of (nf?.itens ?? [])) {
        if (!it.ncm) continue;
        const cands = ruleMap.get(String(it.ncm)) ?? [];
        const rule = cands.find((r) => r.segmento === seg) ?? cands[0];
        if (!rule) { incs.push(`NCM ${it.ncm} sem regra no Banco de NCM`); semRegra++; continue; }

        const cfop = String(it.cfop ?? '');
        const d1 = cfop[0]; // 5=saída intra, 6=saída interestadual, 1/2=entradas, 7=exterior
        const cst = String(it.cst ?? '').trim();
        const isCSOSN = cst.length === 3;       // Simples Nacional usa CSOSN (3 díg)
        const isSimples = regime === 'SIMPLES_NACIONAL' || isCSOSN;

        // ── ICMS — só validamos onde a comparação É FIEL ──
        // Pulamos o que legitimamente NÃO destaca ICMS próprio:
        //  Simples (CSOSN) → ICMS via DAS
        //  CST 40/41/50/51 → isento/não-trib/suspenso/diferido (pICMS 0 correto)
        //  CST 60 → ICMS-ST já recolhido anteriormente (pICMS 0 correto)
        const semIcmsProprio = ['40', '41', '50', '51', '60'].includes(cst);
        const tributadoIntegral = cst === '00' || cst === '10' || cst === ''; // 00/10 destacam ICMS próprio
        const validaIcms = !isSimples && !semIcmsProprio && tributadoIntegral;

        if (validaIcms && it.icms != null) {
          if (d1 === '5') { // operação interna → compara com a alíquota interna padrão
            if (rule.icmsAliquota != null && rule.icmsAliquota > 0 && Math.abs(rule.icmsAliquota - it.icms) > 0.5) {
              incs.push(`NCM ${it.ncm}: ICMS interno ${it.icms}% (padrão ${rule.icmsAliquota}%) — CST ${cst || '00'}`); divergencias++;
            }
          } else if (d1 === '6') { // interestadual → alíquotas legais 4/7/12
            const a = Math.round(it.icms);
            if (![0, 4, 7, 12].includes(a)) {
              incs.push(`NCM ${it.ncm}: ICMS interestadual ${it.icms}% fora do legal (4/7/12%) — CST ${cst || '00'}`); divergencias++;
            }
          }
          // entradas (1/2/3) e exportação (7): não valida ICMS de saída
        }
        // CST 20/90 (redução de base / outros) e CFOP: variam legitimamente —
        // não entram como erro pra não gerar falso positivo. Só sinal confiável.
      }
      await this.prisma.document.update({ where: { id: d.id }, data: { fiscalValidation: JSON.stringify({ ok: incs.length === 0, inconsistencias: incs }) } });
      revalidados++; totalInconsist += incs.length; if (incs.length) comInconsistencia++;
    }
    return { revalidados, comInconsistencia, totalInconsistencias: totalInconsist, semRegra, divergencias };
  }

  /** Limpa as análises (documentos) e zera as flags pra re-análise limpa. */
  async resetAnalises() {
    const clientes = await this.prisma.company.findMany({ where: { sharepointItemId: { not: null } }, select: { id: true } });
    const ids = clientes.map((c) => c.id);
    const del = await this.prisma.document.deleteMany({ where: { companyId: { in: ids } } });
    await this.prisma.company.updateMany({ where: { sharepointItemId: { not: null } }, data: { sharepointAnalisadoEm: null, sharepointDocsCount: null } });
    return { documentosRemovidos: del.count, clientesResetados: ids.length };
  }
}

// ─── Parser de NF-e (regex, sem dependência) ──────────────────
function parseNfe(xml: string): null | {
  tipo: string; numero?: string; chave?: string; dataEmissao?: string; valorTotal?: number;
  emitenteNome?: string; emitenteCnpj?: string; destNome?: string; destCnpj?: string; natOp?: string; temIBSCBS?: boolean;
  totais?: { produtos?: number; icms?: number; ipi?: number; pis?: number; cofins?: number; icmsSt?: number; frete?: number };
  itens: Array<{ ncm: string; descricao?: string; cfop?: string; valor?: number; cst?: string; icms?: number; ipi?: number; pis?: number; cofins?: number; vIcms?: number }>;
} {
  if (!/<NFe|<nfeProc|<infNFe|<CTe|<NFS|<nfse/i.test(xml)) {
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
      valor: num(pick(b, 'vProd')),
      cst: pick(b, 'CST') ?? pick(b, 'CSOSN'),
      icms: num(pick(b, 'pICMS')), ipi: num(pick(b, 'pIPI')), pis: num(pick(b, 'pPIS')), cofins: num(pick(b, 'pCOFINS')),
      vIcms: num(pick(b, 'vICMS')),
    });
  }

  return {
    tipo,
    numero: pick(xml, 'nNF'),
    chave: (xml.match(/Id="NFe(\d{44})"/) ?? [])[1],
    dataEmissao: (
      pick(xml, 'dhEmi') ?? pick(xml, 'dEmi') ??           // NF-e / CT-e
      pick(xml, 'DataEmissao') ?? pick(xml, 'dtEmissao') ?? // NFS-e (ABRASF e variantes)
      pick(xml, 'DataEmissaoRps') ?? pick(xml, 'dhProc') ??
      pick(xml, 'dhRecbto') ?? pick(xml, 'dCompet') ??      // competência
      pick(xml, 'Competencia') ?? pick(xml, 'dhEvento')
    )?.slice(0, 10),
    valorTotal: num(pick(totalBloco, 'vNF')),
    natOp: pick(xml, 'natOp'),
    totais: {
      produtos: num(pick(totalBloco, 'vProd')),
      icms: num(pick(totalBloco, 'vICMS')),
      icmsSt: num(pick(totalBloco, 'vST')),
      ipi: num(pick(totalBloco, 'vIPI')),
      pis: num(pick(totalBloco, 'vPIS')),
      cofins: num(pick(totalBloco, 'vCOFINS')),
      frete: num(pick(totalBloco, 'vFrete')),
    },
    emitenteNome: pick(emitBloco, 'xNome'),
    emitenteCnpj: pick(emitBloco, 'CNPJ'),
    destNome: pick(destBloco, 'xNome'),
    destCnpj: pick(destBloco, 'CNPJ'),
    // Reforma Tributária (NT 2025.002): grupo UB/gIBSCBS + cClassTrib.
    // A partir de 03/08/2026 nota do regime regular SEM esses campos é rejeitada.
    temIBSCBS: /<gIBSCBS|<IBSCBS|cClassTrib|<CST-?IBS/i.test(xml),
    itens,
  };
}
function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m?.[1]?.trim();
}
function num(s?: string): number | undefined { if (s == null) return undefined; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; }
