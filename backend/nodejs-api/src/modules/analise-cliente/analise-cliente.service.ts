import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { OneDriveService } from '../cloud/onedrive.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
import { CertificadoDigitalService, parsePfxReal } from '../certificado-digital/certificado-digital.service';
import { regraMonofasico } from '../organizacao/classificacao.util';

@Injectable()
export class AnaliseClienteService {
  /** Limpa os marcadores 'xml_sem_valor' uma vez por processo (após deploy) p/ retentar. */
  private static _semValorReset = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly onedrive: OneDriveService,
    private readonly ncm: NcmInteligenteService,
    private readonly certificados: CertificadoDigitalService,
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
            else if (!v.ok) for (const d of v.divergencias) incs.push((d as any).obs ? `NCM ${it.ncm}: ${(d as any).obs}` : `NCM ${it.ncm}: ${d.campo} veio ${d.encontrado}% (esperado ${d.esperado}%)`);
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

  /** Cria um Document a partir de um XML já baixado (dedup por nome de arquivo do drive). */
  private async criarDocDeXml(companyId: string, xml: string, fileName: string, fileUrl: string, segmento?: string, uf?: string): Promise<'novo' | 'invalido'> {
    const nf = parseNfe(xml);
    if (!nf) return 'invalido';
    const incs: string[] = [];
    for (const it of nf.itens) {
      if (!it.ncm) continue;
      try {
        const v = await this.ncm.validarTributacao({ ncm: it.ncm, segmento, uf, icmsAliquota: it.icms, ipiAliquota: it.ipi, pisAliquota: it.pis, cofinsAliquota: it.cofins, cfop: it.cfop });
        if (!v.regraEncontrada) incs.push(`NCM ${it.ncm} sem regra no Banco de NCM`);
        else if (!v.ok) for (const dd of v.divergencias) incs.push((dd as any).obs ? `NCM ${it.ncm}: ${(dd as any).obs}` : `NCM ${it.ncm}: ${dd.campo} veio ${dd.encontrado}% (esperado ${dd.esperado}%)`);
      } catch { /* segue */ }
    }
    try {
      await this.prisma.document.create({
        data: {
          companyId, type: nf.tipo, status: 'completed', originalFilename: fileName, fileUrl,
          number: nf.numero ? String(nf.numero) : undefined, totalValue: nf.valorTotal,
          issuerName: nf.emitenteNome, issuerCnpj: nf.emitenteCnpj, recipientName: nf.destNome, recipientCnpj: nf.destCnpj,
          confidenceScore: 1, extractedData: JSON.stringify(nf),
          fiscalValidation: JSON.stringify({ ok: incs.length === 0, inconsistencias: incs }),
          issueDate: nf.dataEmissao ? new Date(nf.dataEmissao) : undefined,
        },
      });
      return 'novo';
    } catch { return 'invalido'; }
  }

  /**
   * SINCRONIZAÇÃO POR DELTA (Graph) — a forma eficiente/tempo real. 1ª vez: lê TODOS os
   * arquivos da pasta do cliente (recursivo, sem teto → acha 2026 esteja onde estiver);
   * depois, só o que mudou. Guarda o deltaLink por cliente.
   */
  async sincronizarDelta(companyId: string) {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, sharepointDriveId: true, sharepointItemId: true, sharepointDeltaLink: true, segmentoFiscal: true, uf: true },
    });
    if (!c?.sharepointDriveId || !c?.sharepointItemId) throw new BadRequestException('Cliente sem pasta do SharePoint vinculada.');
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) throw new BadRequestException('Nenhuma conexão OneDrive ativa.');

    const { arquivos, deltaLink } = await this.onedrive.deltaScan(conn.id, c.sharepointDriveId, c.sharepointItemId, c.sharepointDeltaLink ?? undefined);
    const existentes = new Set(
      (await this.prisma.document.findMany({ where: { companyId }, select: { originalFilename: true } })).map((d) => d.originalFilename),
    );
    const ehXml = (n: string) => n.toLowerCase().endsWith('.xml');
    const extDe = (nome: string) => { const p = nome.split('.'); return p.length > 1 ? p.pop()!.toLowerCase().slice(0, 12) : 'arquivo'; };
    const novos = arquivos.filter((f) => !existentes.has(f.name));

    let novosXml = 0, novosOutros = 0, ignorados = 0;
    for (const f of novos.filter((f) => !ehXml(f.name))) {
      try {
        await this.prisma.document.create({ data: { companyId, type: extDe(f.name), status: 'recebido', originalFilename: f.name, fileUrl: `${f.driveId}|${f.id}`, confidenceScore: 0, issueDate: f.modified ? new Date(f.modified) : undefined } });
        novosOutros++;
      } catch { ignorados++; }
    }
    const xmls = novos.filter((f) => ehXml(f.name));
    const CONC = 10; // downloads simultâneos por cliente (turbo)
    for (let i = 0; i < xmls.length; i += CONC) {
      const fatia = xmls.slice(i, i + CONC);
      await Promise.all(fatia.map(async (f) => {
        try {
          const { buffer } = await this.onedrive.downloadFile(conn.id, f.id, f.driveId);
          const r = await this.criarDocDeXml(companyId, buffer.toString('utf8'), f.name, `${f.driveId}|${f.id}`, c.segmentoFiscal ?? undefined, c.uf ?? undefined);
          if (r === 'novo') novosXml++; else ignorados++;
        } catch { ignorados++; }
      }));
    }
    await this.prisma.company.update({ where: { id: companyId }, data: { sharepointDeltaLink: deltaLink ?? c.sharepointDeltaLink, sharepointAnalisadoEm: new Date(), sharepointDocsCount: existentes.size + novosXml + novosOutros } });
    return { cliente: c.name, arquivosNoDelta: arquivos.length, novosXml, novosOutros, ignorados, incremental: !!c.sharepointDeltaLink };
  }

  /** Delta em lote (agendador/manual): clientes há mais tempo sem sync, com pasta.
   *  Processa CLIENTES EM PARALELO (turbo) — muito mais rápido na carga inicial. */
  /** Religa pastas órfãs (itemId que virou 404 no Graph) usando a conexão ativa. */
  async repararPastasOrfas() {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    return this.onedrive.repararPastasOrfas(conn.id);
  }

  async sincronizarDeltaLote(limit = 6) {
    const lote = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } },
      orderBy: { sharepointAnalisadoEm: 'asc' }, take: limit, select: { id: true, name: true },
    });
    const pend = await this.prisma.company.count({ where: { active: true, sharepointItemId: { not: null } } });
    let novos = 0; const detalhes: any[] = [];
    const CONC_CLIENTES = 5; // clientes simultâneos (cada um baixa seus XMLs em paralelo)
    for (let i = 0; i < lote.length; i += CONC_CLIENTES) {
      const fatia = lote.slice(i, i + CONC_CLIENTES);
      const rs = await Promise.all(fatia.map((c) =>
        this.sincronizarDelta(c.id).then((r) => ({ c, r })).catch((e) => ({ c, err: e })),
      ));
      for (const x of rs as any[]) {
        if (x.err) {
          detalhes.push({ cliente: x.c.name, erro: x.err?.message ?? 'erro' });
          // manda pro fim da fila mesmo com erro — senão os que falham monopolizam o lote
          await this.prisma.company.update({ where: { id: x.c.id }, data: { sharepointAnalisadoEm: new Date() } }).catch(() => undefined);
          continue;
        }
        const n = (x.r.novosXml ?? 0) + (x.r.novosOutros ?? 0);
        novos += n;
        if (n > 0) detalhes.push({ cliente: x.c.name, xml: x.r.novosXml, outros: x.r.novosOutros });
      }
    }
    return { processados: lote.length, deUmTotal: pend, novos, detalhes };
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

        // ── MONOFÁSICO (base legal) — oportunidade, não erro de digitação ──
        // Na revenda de produto monofásico, PIS/COFINS é 0% por lei. Nota que cobra
        // PIS/COFINS na revenda = recolhimento indevido (recuperável em até 5 anos).
        const mono = regraMonofasico(String(it.ncm));
        if (mono && ['5', '6', '7'].includes(d1) && !isSimples) {
          const pc = Math.round(((it.pis ?? 0) + (it.cofins ?? 0)) * 100) / 100;
          if (pc > 0.01) { incs.push(`NCM ${it.ncm}: monofásico (${mono.grupo}, ${mono.lei}) — PIS/COFINS ${pc}% cobrado na revenda deve ser 0%. Recolhimento indevido, recuperável.`); divergencias++; }
        }

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

  /**
   * RE-PROCESSA os documentos que ficaram SEM DATA (bug antigo do parser em NFS-e/CT-e
   * com namespace). Re-baixa só esses (pelo fileUrl driveId|id já guardado) e re-parseia
   * com o parser corrigido — aí a data aparece e o doc passa a contar no ano/mês certo.
   * Chamável em loop até restantes=0. Não re-varre o drive inteiro.
   */
  async reparsearSemData(limit = 400) {
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) throw new BadRequestException('Nenhuma conexão OneDrive ativa.');
    const pendentes = await this.prisma.document.count({
      where: { issueDate: null, fileUrl: { contains: '|' }, extractedData: { not: null } },
    });
    const docs = await this.prisma.document.findMany({
      where: { issueDate: null, fileUrl: { contains: '|' }, extractedData: { not: null } },
      select: { id: true, fileUrl: true }, take: limit,
    });
    let corrigidos = 0, semRef = 0, falhou = 0;
    for (const d of docs) {
      const [driveId, fileId] = (d.fileUrl ?? '').split('|');
      if (!fileId || driveId === 'sieg' || driveId === 'sefaz') { semRef++; continue; }
      try {
        const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId);
        const nf = parseNfe(buffer.toString('utf8'));
        if (nf?.dataEmissao) {
          await this.prisma.document.update({
            where: { id: d.id },
            data: {
              issueDate: new Date(nf.dataEmissao),
              number: nf.numero ? String(nf.numero) : undefined,
              totalValue: nf.valorTotal ?? undefined,
              extractedData: JSON.stringify(nf),
            },
          });
          corrigidos++;
        } else falhou++;
      } catch { falhou++; }
    }
    return { processados: docs.length, corrigidos, semReferencia: semRef, semDataApos: falhou, restantes: Math.max(0, pendentes - docs.length) };
  }

  /**
   * REPROCESSA NFS-e (e XMLs) que ficaram SEM VALOR — re-baixa o XML do OneDrive e aplica
   * o parser novo (padrão ABRASF: PrestadorServico + ValorServicos). Bounded por tempo/limite.
   */
  async reprocessarSemValor(opts?: { limit?: number; timeBudgetMs?: number }) {
    const limit = opts?.limit ?? 300;
    const timeBudgetMs = opts?.timeBudgetMs ?? 4 * 60_000;
    const inicio = Date.now();
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    // 1x por deploy: limpa marcadores antigos p/ retentar com o parser atual (ex.: fix de CT-e)
    if (!AnaliseClienteService._semValorReset) {
      await this.prisma.document.updateMany({ where: { status: 'xml_sem_valor' }, data: { status: 'completed' } }).catch(() => undefined);
      AnaliseClienteService._semValorReset = true;
    }
    // exclui os já tentados sem sucesso (status sentinela) p/ não repetir o mesmo lote
    const filtro: any = { totalValue: null, originalFilename: { endsWith: '.xml' }, fileUrl: { contains: '|' }, NOT: { status: 'xml_sem_valor' } };
    const pendentes = await this.prisma.document.count({ where: filtro });
    const docs = await this.prisma.document.findMany({
      where: filtro, select: { id: true, companyId: true, fileUrl: true }, take: limit,
      orderBy: { createdAt: 'desc' },
    });
    let corrigidos = 0, semRef = 0, semValorAinda = 0, falhou = 0;
    for (const d of docs) {
      if (Date.now() - inicio > timeBudgetMs) break;
      const [driveId, fileId] = (d.fileUrl ?? '').split('|');
      if (!fileId || driveId === 'sieg' || driveId === 'sefaz') { semRef++; continue; }
      try {
        const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId);
        const nf = parseNfe(buffer.toString('utf8'));
        if (nf && (nf.valorTotal != null || nf.emitenteNome)) {
          await this.prisma.document.update({
            where: { id: d.id },
            data: {
              type: nf.tipo, totalValue: nf.valorTotal ?? undefined,
              number: nf.numero ? String(nf.numero) : undefined,
              issuerName: nf.emitenteNome ?? undefined, issuerCnpj: nf.emitenteCnpj ?? undefined,
              recipientName: nf.destNome ?? undefined, recipientCnpj: nf.destCnpj ?? undefined,
              issueDate: nf.dataEmissao ? new Date(nf.dataEmissao) : undefined,
              extractedData: JSON.stringify(nf),
            },
          });
          if (nf.valorTotal != null) corrigidos++; else semValorAinda++;
        } else {
          // parser não extraiu valor nem emitente — marca p/ não repetir (evento/cancelamento/layout raro)
          await this.prisma.document.update({ where: { id: d.id }, data: { status: 'xml_sem_valor' } }).catch(() => undefined);
          semValorAinda++;
        }
      } catch { falhou++; }
    }
    return { pendentesAntes: pendentes, processados: docs.length, corrigidos, semValorAinda, semReferencia: semRef, falhou, restantes: Math.max(0, pendentes - corrigidos) };
  }

  /**
   * DIAGNÓSTICO: baixa alguns XMLs SEM VALOR e retorna só a ESTRUTURA (nomes de tags,
   * raiz, flags de padrões conhecidos) — sem expor valores/CNPJ. Serve p/ descobrir por
   * que o parser não extrai (evento? cancelamento? layout municipal diferente?).
   */
  async diagnosticarXmlSemValor(n = 6) {
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const docs = await this.prisma.document.findMany({
      where: { totalValue: null, originalFilename: { endsWith: '.xml' }, fileUrl: { contains: '|' } },
      select: { id: true, originalFilename: true, fileUrl: true }, take: n, orderBy: { createdAt: 'desc' },
    });
    const amostras: any[] = [];
    for (const d of docs) {
      const [driveId, fileId] = (d.fileUrl ?? '').split('|');
      if (!fileId) continue;
      try {
        const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId);
        const xml = buffer.toString('utf8');
        const tags = [...new Set((xml.match(/<([A-Za-z_][\w.:-]*)/g) ?? []).map((t) => t.slice(1)))].slice(0, 60);
        const raiz = (xml.match(/<\?xml[^>]*\?>\s*<([\w.:-]+)/) ?? xml.match(/<([\w.:-]+)/) ?? [])[1];
        const tem = (re: RegExp) => re.test(xml);
        amostras.push({
          arquivo: (d.originalFilename ?? '').slice(-45),
          raiz,
          tamanho: xml.length,
          ehEvento: tem(/procEventoNFe|retEvento|<evento|<Cancelamento|<CancelarNfse|<SubstituicaoNfse/i),
          temValorServicos: tem(/ValorServicos/i),
          temValorNfse: tem(/ValorNfse|ValorLiquidoNfse|ValorTotalNota|ValorTotalRecebido/i),
          temPrestador: tem(/Prestador/i),
          temEmit: tem(/<emit\b/i),
          temInfNfse: tem(/InfNfse|CompNfse/i),
          temValoresGenerico: tem(/<Valor(?:es)?\b/i),
          tags,
        });
      } catch (e: any) { amostras.push({ arquivo: (d.originalFilename ?? '').slice(-45), erro: (e?.message ?? 'erro').slice(0, 60) }); }
    }
    return { amostras };
  }

  /**
   * IMPORTA em lote os certificados A1 (.pfx/.p12) que já estão nas pastas dos clientes,
   * casa cada um com sua empresa pelo CNPJ do certificado e cadastra — assim a varredura
   * SEFAZ passa a puxar sem procuração e-CAC. Senha: tenta a padrão informada, o CNPJ e
   * seus tokens, e o conteúdo de arquivos "senha*.txt" da mesma pasta do cliente.
   */
  async importarCertificadosDrive(opts?: { senhaPadrao?: string; limit?: number; timeBudgetMs?: number }) {
    const inicio = Date.now();
    const timeBudgetMs = opts?.timeBudgetMs ?? 5 * 60_000;
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };

    // com senha padrão nova → retenta os que ficaram "sem senha" (não os expirados)
    if (opts?.senhaPadrao) {
      await this.prisma.document.updateMany({ where: { status: 'cert_semsenha' }, data: { status: 'completed' } }).catch(() => undefined);
    }
    // certificados .pfx/.p12 já capturados, ignorando os já tentados sem sucesso (sem senha ou expirados)
    const certs = await this.prisma.document.findMany({
      where: {
        OR: [{ originalFilename: { endsWith: '.pfx' } }, { originalFilename: { endsWith: '.p12' } }],
        fileUrl: { contains: '|' }, NOT: { status: { in: ['cert_semsenha', 'cert_expirado'] } },
      },
      select: { id: true, companyId: true, fileUrl: true, originalFilename: true },
      take: opts?.limit ?? 400,
    });
    // dicas de senha: arquivos "senha*.txt" por empresa (baixados sob demanda)
    const senhaDocs = await this.prisma.document.findMany({
      where: { originalFilename: { contains: 'senha', mode: 'insensitive' }, fileUrl: { contains: '|' } },
      select: { companyId: true, fileUrl: true },
    });
    const senhaPorEmpresa = new Map<string, string[]>();
    for (const s of senhaDocs) { const a = senhaPorEmpresa.get(s.companyId) ?? []; a.push(s.fileUrl!); senhaPorEmpresa.set(s.companyId, a); }
    const baixarTexto = async (fileUrl: string): Promise<string> => {
      const [driveId, fileId] = fileUrl.split('|'); if (!fileId) return '';
      try { const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId); return buffer.toString('utf8').slice(0, 2000); } catch { return ''; }
    };

    let importados = 0, semSenha = 0, semRef = 0, cnpjDivergente = 0, jaTinha = 0, expirados = 0, falhou = 0;
    const detalhe: any[] = [];
    for (const c of certs) {
      if (Date.now() - inicio > timeBudgetMs) break;
      const [driveId, fileId] = (c.fileUrl ?? '').split('|');
      if (!fileId || driveId === 'sefaz' || driveId === 'sieg') { semRef++; continue; }
      const company = await this.prisma.company.findUnique({ where: { id: c.companyId }, select: { id: true, name: true, cnpj: true } });
      if (!company) { semRef++; continue; }
      const cnpjEmpresa = (company.cnpj ?? '').replace(/\D/g, '');
      // já tem certificado PRÓPRIO ativo? não sobrescreve
      const jaAtivo = await this.prisma.certificadoDigital.findFirst({ where: { companyId: c.companyId, active: true, escritorio: false }, select: { id: true } });
      if (jaAtivo) { jaTinha++; continue; }

      let b64: string;
      try { const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId); b64 = buffer.toString('base64'); }
      catch { falhou++; continue; }

      // candidatos de senha
      const cands = new Set<string>();
      if (opts?.senhaPadrao) cands.add(opts.senhaPadrao);
      if (cnpjEmpresa) { cands.add(cnpjEmpresa); cands.add(cnpjEmpresa.slice(0, 8)); }
      for (const fu of senhaPorEmpresa.get(c.companyId) ?? []) {
        const txt = await baixarTexto(fu);
        for (const tok of (txt.match(/[A-Za-z0-9@#!$%._-]{4,30}/g) ?? []).slice(0, 20)) cands.add(tok);
      }
      ['1234', '123456'].forEach((s) => cands.add(s));

      let parsed: any = null, senhaOk = '';
      for (const s of cands) { try { parsed = parsePfxReal(b64, s); senhaOk = s; break; } catch { /* senha errada */ } }
      if (!parsed) { semSenha++; await this.prisma.document.update({ where: { id: c.id }, data: { status: 'cert_semsenha' } }).catch(() => undefined); continue; }

      const cnpjCert = (parsed.cnpjCpf ?? '').replace(/\D/g, '');
      if (parsed.dataValidade && new Date(parsed.dataValidade).getTime() < Date.now()) {
        expirados++; detalhe.push({ empresa: company.name, arquivo: c.originalFilename, motivo: 'certificado expirado' });
        await this.prisma.document.update({ where: { id: c.id }, data: { status: 'cert_expirado' } }).catch(() => undefined);
        continue;
      }
      // casa pelo CNPJ (se a empresa tem CNPJ real): evita cadastrar cert de terceiro
      if (cnpjEmpresa && cnpjEmpresa.length === 14 && cnpjCert && cnpjCert !== cnpjEmpresa) {
        cnpjDivergente++; detalhe.push({ empresa: company.name, cnpjCert, cnpjEmpresa, motivo: 'CNPJ do certificado difere do cliente' });
        continue;
      }
      try {
        await this.certificados.salvarCertificadoA1(c.companyId, b64, senhaOk, c.originalFilename ?? 'certificado.pfx');
        importados++;
        detalhe.push({ empresa: company.name, cnpj: cnpjCert, validade: parsed.dataValidade });
      } catch (e: any) { falhou++; detalhe.push({ empresa: company.name, motivo: (e?.message ?? 'erro ao salvar').slice(0, 80) }); }
    }
    return {
      certificadosEncontrados: certs.length, importados, jaTinham: jaTinha,
      senhaNaoEncontrada: semSenha, cnpjDivergente, expirados, semReferencia: semRef, falhou,
      detalhe: detalhe.slice(0, 60),
    };
  }

  /** Cache do mapa de pastas (calcular é caro — 1 chamada Graph por cliente). */
  private static _mapaPastas: any = null;

  /**
   * MAPEIA A ESTRUTURA DE PASTAS do OneDrive: para cada cliente, lista as subpastas
   * (Fiscal, Contábil, Folha, Certificado, ...) e agrega quais são comuns na carteira.
   * Resultado é cacheado; passe refresh=true p/ recalcular.
   */
  async mapearPastasOneDrive(opts?: { limitClientes?: number; timeBudgetMs?: number; refresh?: boolean; profundidade?: number }) {
    if (AnaliseClienteService._mapaPastas && !opts?.refresh) return AnaliseClienteService._mapaPastas;
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const inicio = Date.now();
    const timeBudgetMs = opts?.timeBudgetMs ?? 5 * 60_000;
    const prof = opts?.profundidade ?? 1;
    const empresas = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } },
      select: { id: true, name: true, sharepointDriveId: true, sharepointItemId: true },
      take: opts?.limitClientes ?? 300,
    });
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const freq = new Map<string, { rotulo: string; clientes: number }>();
    const exemplos: any[] = [];
    let mapeados = 0, semAcesso = 0;

    const listarSub = async (driveId: string, itemId: string): Promise<string[]> => {
      try {
        const filhos = await this.onedrive.listAllChildren(conn.id, driveId, itemId);
        return filhos.filter((f: any) => f.isFolder).map((f: any) => ({ name: f.name, id: f.id, driveId })) as any;
      } catch { return []; }
    };

    for (const e of empresas) {
      if (Date.now() - inicio > timeBudgetMs) break;
      if (!e.sharepointDriveId || !e.sharepointItemId) continue;
      const nivel1: any[] = await listarSub(e.sharepointDriveId, e.sharepointItemId);
      if (!nivel1.length) { semAcesso++; continue; }
      const estrutura: any = {};
      for (const p of nivel1) {
        const k = norm(p.name);
        const cur = freq.get(k) ?? { rotulo: p.name, clientes: 0 };
        cur.clientes++; freq.set(k, cur);
        // 2º nível (opcional) — subpastas dentro de cada pasta principal
        if (prof >= 2 && Date.now() - inicio < timeBudgetMs) {
          const sub = await listarSub(p.driveId, p.id);
          estrutura[p.name] = sub.map((s: any) => s.name);
        } else {
          estrutura[p.name] = null;
        }
      }
      if (exemplos.length < 10) exemplos.push({ cliente: e.name, pastas: Object.keys(estrutura), subpastas: prof >= 2 ? estrutura : undefined });
      mapeados++;
    }
    const ranking = [...freq.values()].sort((a, b) => b.clientes - a.clientes);
    const resultado = {
      clientesMapeados: mapeados, semAcesso, totalEmpresas: empresas.length,
      profundidade: prof,
      pastasComuns: ranking.slice(0, 50),
      exemplos,
      calculadoEm: new Date().toISOString(),
    };
    AnaliseClienteService._mapaPastas = resultado;
    return resultado;
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

  // ── NFS-e municipal (padrão ABRASF e variantes): não tem <emit>/<ICMSTot>. ──
  // Prestador = emitente; Tomador = destinatário; valor em <ValorServicos>/<ValorLiquidoNfse>.
  const prestBloco = (xml.match(/<(?:[\w.-]+:)?(?:PrestadorServico|Prestador|prest)(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?(?:PrestadorServico|Prestador|prest)>/i) ?? [''])[0];
  const tomaBloco = (xml.match(/<(?:[\w.-]+:)?(?:TomadorServico|Tomador|toma)(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?(?:TomadorServico|Tomador|toma)>/i) ?? [''])[0];
  const infNfseBloco = (xml.match(/<(?:[\w.-]+:)?(?:InfNfse|IdentificacaoNfse|Nfse|CompNfse)(?:\s[^>]*)?>[\s\S]*?(?:<\/(?:[\w.-]+:)?(?:InfNfse|IdentificacaoNfse)>|$)/i) ?? [''])[0];
  const pickCnpj = (bloco: string) => pick(bloco, 'CNPJ') ?? pick(bloco, 'Cnpj') ?? pick(bloco, 'CpfCnpj')?.replace(/\D/g, '') ?? undefined;

  const valorTotal =
    num(pick(totalBloco, 'vNF')) ??                       // NF-e
    num(pick(xml, 'vTPrest')) ?? num(pick(xml, 'vRec')) ?? // CT-e (transporte): total da prestação / a receber
    num(pick(xml, 'ValorLiquidoNfse')) ??                 // NFS-e ABRASF (líquido)
    num(pick(xml, 'ValorServicos')) ??                    // NFS-e (bruto dos serviços)
    num(pick(xml, 'ValorTotalNota')) ?? num(pick(xml, 'ValorTotalRecebido')) ??
    num(pick(xml, 'ValorNfse')) ?? num(pick(xml, 'vServ')) ?? num(pick(xml, 'ValorTotalServico')) ??
    num(pick(xml, 'ValorTotal'));

  const emitenteNome = pick(emitBloco, 'xNome') ?? pick(prestBloco, 'RazaoSocial') ?? pick(prestBloco, 'xNome') ?? pick(prestBloco, 'NomeRazaoSocial');
  const emitenteCnpj = pickCnpj(emitBloco) ?? pickCnpj(prestBloco);
  const destNome = pick(destBloco, 'xNome') ?? pick(tomaBloco, 'RazaoSocial') ?? pick(tomaBloco, 'xNome') ?? pick(tomaBloco, 'NomeRazaoSocial');
  const destCnpj = pickCnpj(destBloco) ?? pickCnpj(tomaBloco);
  const numero = pick(xml, 'nNF') ?? pick(xml, 'nCT') ?? pick(infNfseBloco, 'Numero') ?? pick(xml, 'NumeroNfse') ?? pick(xml, 'Numero');

  return {
    tipo,
    numero,
    chave: (xml.match(/Id="NFe(\d{44})"/) ?? [])[1],
    dataEmissao: extrairData(xml),
    valorTotal,
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
    emitenteNome,
    emitenteCnpj,
    destNome,
    destCnpj,
    // Reforma Tributária (NT 2025.002): grupo UB/gIBSCBS + cClassTrib.
    // A partir de 03/08/2026 nota do regime regular SEM esses campos é rejeitada.
    temIBSCBS: /<gIBSCBS|<IBSCBS|cClassTrib|<CST-?IBS/i.test(xml),
    itens,
  };
}
/** Data de emissão robusta: NF-e, CT-e e as muitas variantes de NFS-e municipal. */
function extrairData(xml: string): string | undefined {
  const tags = [
    'dhEmi', 'dEmi',                                   // NF-e / CT-e
    'DataEmissao', 'dtEmissao', 'DataEmissaoNfse', 'dEmiNfse', 'DtEmi', 'dtEmi', 'data_emissao', 'dataEmissao',
    'DataEmissaoRps', 'dhProc', 'dhRecbto', 'dCompet', 'Competencia', 'competencia', 'dhEvento',
  ];
  for (const t of tags) {
    const v = pick(xml, t);
    if (v) { const iso = normalizarData(v); if (iso) return iso; }
  }
  // fallback: qualquer tag cujo nome contenha "emiss"/"compet" com uma data dentro
  const m = xml.match(/<(?:[\w.-]+:)?[\w.-]*(?:emiss|compet)[\w.-]*(?:\s[^>]*)?>\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
  if (m) return normalizarData(m[1]);
  return undefined;
}
/** Normaliza para YYYY-MM-DD (aceita ISO e dd/mm/aaaa). */
function normalizarData(v: string): string | undefined {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}
function pick(xml: string, tag: string): string | undefined {
  // Tolera prefixo de namespace (<ns2:DataEmissao>) e atributos (<dhEmi xmlns="...">),
  // comuns em NFS-e municipais e CT-e. Sem isso, esses XMLs entravam SEM data/campos.
  const m = xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${tag}>`, 'i'));
  return m?.[1]?.trim();
}
function num(s?: string): number | undefined { if (s == null) return undefined; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? undefined : n; }
