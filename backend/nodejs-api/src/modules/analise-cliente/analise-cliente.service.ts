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
    const jaTem = await this.prisma.document.findMany({ where: { companyId }, select: { originalFilename: true, folderPath: true } });
    // XML dedup por NOME (chave é única); NÃO-XML (comprovantes) dedup por PASTA+NOME —
    // assim "PGDASD-RECIBO.pdf" de cada mês é guardado separado (antes colapsava em 1).
    const existNome = new Set(jaTem.map((d) => d.originalFilename));
    const existPasta = new Set(jaTem.map((d) => `${d.folderPath ?? ''}|${d.originalFilename}`));
    const ehXml = (n: string) => n.toLowerCase().endsWith('.xml');
    const extDe = (nome: string) => { const p = nome.split('.'); return p.length > 1 ? p.pop()!.toLowerCase().slice(0, 12) : 'arquivo'; };

    let novosXml = 0, novosOutros = 0, ignorados = 0;
    for (const f of arquivos.filter((f: any) => !ehXml(f.name) && !existPasta.has(`${f.path ?? ''}|${f.name}`))) {
      try {
        await this.prisma.document.create({ data: { companyId, type: extDe(f.name), status: 'recebido', originalFilename: f.name, fileUrl: `${f.driveId}|${f.id}`, folderPath: (f as any).path || null, confidenceScore: 0, issueDate: f.modified ? new Date(f.modified) : undefined } });
        novosOutros++;
      } catch { ignorados++; }
    }
    const novos = arquivos.filter((f: any) => !existNome.has(f.name));
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
    await this.prisma.company.update({ where: { id: companyId }, data: { sharepointDeltaLink: deltaLink ?? c.sharepointDeltaLink, sharepointAnalisadoEm: new Date(), sharepointDocsCount: jaTem.length + novosXml + novosOutros } });
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

  /**
   * RECONCILIAÇÃO RÁPIDA VIA SEARCH — para cada cliente, 1 busca no índice do servidor
   * pelos comprovantes do ANO (ex.: arquivos "05.2026 - Rec.pdf"). Extrai as competências
   * que TÊM comprovante e marca as obrigações do cliente. Muito mais rápido que re-capturar.
   */
  async reconciliarViaSearch(opts?: { ano?: number; limitEmpresas?: number; timeBudgetMs?: number }) {
    const ano = opts?.ano ?? new Date().getFullYear();
    const timeBudgetMs = opts?.timeBudgetMs ?? 4 * 60_000;
    const inicio = Date.now();
    const now = new Date();
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const ehComprovante = (n: string) => /rec|recibo|comprovante|declarac|\bdas\b|pgdas|dctf|darf|fgts|gps|guia|sped|gia|gare|esocial|reinf/i.test(n);

    const empresas = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } },
      select: { id: true, name: true, sharepointDriveId: true, sharepointItemId: true },
      take: opts?.limitEmpresas ?? 200, orderBy: { updatedAt: 'asc' },
    });
    let proc = 0, achadosTot = 0, entregue = 0, vencida = 0, pendente = 0, comProva = 0, semAcesso = 0;
    const detalhe: any[] = [];
    for (const e of empresas) {
      if (Date.now() - inicio > timeBudgetMs) break;
      let arquivos: Array<{ name: string; path: string }> = [];
      try { arquivos = await this.onedrive.searchInFolder(conn.id, e.sharepointDriveId!, e.sharepointItemId!, String(ano)); }
      catch { semAcesso++; continue; }
      achadosTot += arquivos.length;
      // competências (YYYY-MM) que têm comprovante do ano
      const comps = new Set<string>();
      for (const f of arquivos) {
        if (!ehComprovante(f.name)) continue;
        const s = norm(`${f.name} ${f.path}`);
        for (let m = 1; m <= 12; m++) {
          const mm = String(m).padStart(2, '0');
          if (s.includes(`${mm} ${ano}`) || s.includes(`${ano} ${mm}`) || s.includes(`${mm}${ano}`) || (s.includes(MESES[m - 1]) && s.includes(String(ano)))) {
            comps.add(`${ano}-${mm}`);
          }
        }
      }
      if (comps.size) comProva++;
      const itens = await this.prisma.fiscalCalendarItem.findMany({
        where: { companyId: e.id, competencia: { startsWith: String(ano) }, status: { in: ['pendente', 'vencida', 'entregue'] } },
        select: { id: true, competencia: true, dataVencimento: true, status: true },
      });
      for (const it of itens) {
        const novo = comps.has(it.competencia) ? 'entregue' : (new Date(it.dataVencimento) < now ? 'vencida' : 'pendente');
        if (novo !== it.status) {
          await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: novo } }).catch(() => undefined);
          if (novo === 'entregue') entregue++; else if (novo === 'vencida') vencida++; else pendente++;
        }
      }
      await this.prisma.company.update({ where: { id: e.id }, data: { updatedAt: new Date() } }).catch(() => undefined);
      if (detalhe.length < 30 && comps.size) detalhe.push({ cliente: e.name, competenciasComProva: [...comps].sort() });
      proc++;
    }
    return { ano, empresasProcessadas: proc, comprovantesAchados: achadosTot, clientesComProva: comProva, marcadasEntregue: entregue, marcadasVencida: vencida, marcadasPendente: pendente, semAcesso, detalhe };
  }

  /**
   * RECONCILIAÇÃO GLOBAL POR TIPO — busca cada TIPO de comprovante no Drive inteiro
   * (PGDASD, DCTF, FGTS...) e usa o webUrl p/ obter cliente + pasta + competência de cada
   * arquivo. Casa POR TIPO E COMPETÊNCIA em qualquer ano (acha entregas de meses passados).
   * Poucas buscas globais (não uma por cliente) → rápido e completo.
   */
  async reconciliarGlobalPorTipo(opts?: { anos?: number[]; ultimosMeses?: number }) {
    const anos = opts?.anos ?? [2024, 2025, 2026];
    // janelas (y,m) a varrer: por padrão todos os 12 meses de cada ano; se ultimosMeses, só os
    // N meses mais recentes (uso no ciclo — captura recibos novos sem varrer o ano inteiro).
    let janelas: Array<{ y: number; m: number }> = [];
    for (const y of anos) for (let m = 1; m <= 12; m++) janelas.push({ y, m });
    if (opts?.ultimosMeses) {
      const now = new Date(); const curY = now.getFullYear(), curM = now.getMonth() + 1;
      janelas = janelas.filter((j) => { const diff = (curY - j.y) * 12 + (curM - j.m); return diff >= 0 && diff < opts.ultimosMeses!; });
    }
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    // resolução de cliente pelo 1º segmento do caminho ("494 - OCA TECNOLOGIA (SN)")
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true, name: true, clienteCodigo: true } });
    const porCodigo = new Map<string, string>(); const porNome = new Map<string, string>();
    for (const c of companies) { if (c.clienteCodigo) porCodigo.set(String(c.clienteCodigo), c.id); const n = norm(c.name); if (n) porNome.set(n, c.id); }
    const resolveSeg = (seg: string): string | null => {
      const codeM = seg.match(/^\s*(\d+)\s*[-–]/);
      if (codeM && porCodigo.has(codeM[1])) return porCodigo.get(codeM[1])!;
      const nn = norm(seg.replace(/^\s*\d+\s*[-–]\s*/, '').replace(/\([^)]*\)/g, ''));
      if (nn.length >= 5 && porNome.has(nn)) return porNome.get(nn)!;
      if (nn.length >= 8) for (const [n, id] of porNome) if (n.length >= 8 && (nn.includes(n) || n.includes(nn))) return id;
      return null;
    };
    // a pasta do cliente pode estar em QUALQUER nível ("Empresas Ativas/113 - CLINICA OWEN/...")
    const resolveClient = (fullPath: string): string | null => {
      for (const seg of (fullPath || '').split('/')) { const cid = resolveSeg(seg); if (cid) return cid; }
      return null;
    };
    const extractComp = (s: string): string | null => {
      for (const y of anos) for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        if (s.includes(`${mm} ${y}`) || s.includes(`${y} ${mm}`) || s.includes(`${mm}${y}`) || (s.includes(MESES[m - 1]) && s.includes(String(y)))) return `${y}-${mm}`;
      }
      return null;
    };

    // busca cada tipo TENANT-WIDE (Search API). Termos AMPLOS (o escritório nomeia de vários
    // jeitos: "PGDASD-RECIBO", "REC DAS", "Simples Nacional.pdf") + VALIDAÇÃO por regex no NOME
    // do arquivo, p/ não pegar falso positivo (ex.: "vendas" contém "das"). A competência sai
    // sempre da PASTA (ex.: /2026/06.2026/). Só marca entrega com nome que confirma o tipo.
    // qs = termos por NOME (validados por regex). conteudo = FRASES DENTRO do PDF (Search API
    // indexa o texto, inclusive OCR de escaneados) — quando batem, o arquivo É aquele documento,
    // independente do nome; por isso NÃO precisam de validação de nome (a frase já é a prova).
    const termos: Record<string, { qs: string[]; re: RegExp; conteudo?: string[] }> = {
      DAS: {
        qs: ['PGDASD', 'DAS', 'Simples Nacional', 'PGMEI', 'RECIBO SN', 'REC SN', 'DECLARACAO SN', 'EXTRATO SN', 'Recibo de Pagamento', 'Extrato Mensal', 'Sem Movimento', 'DEC SM', 'Declaracao'],
        re: /pgdas|pgmei|(^|[^a-z])das([^a-z]|$)|simples\s*nacional|(?:rec\w*|dec\w*|declara\w*|extrato)[\s\-]+sn\b|recibo\s+de\s+pagamento|extrato\s+mensal|(?:dec|declara\w*)[\s\d]*\bsm\b|se?m\s*moviment/i,
        conteudo: ['"Documento de Arrecadacao do Simples Nacional"', 'PGDAS-D'],
      },
      'DASN-SIMEI': { qs: ['DASN', 'DASN-SIMEI'], re: /dasn/i },
      DCTFWeb: { qs: ['DCTF', 'DCTFWeb'], re: /dctf/i, conteudo: ['"Recibo de Entrega da DCTFWeb"'] },
      FGTS: { qs: ['FGTS', 'GRF'], re: /fgts|(^|[^a-z])grf/i },
      EFD_REINF: { qs: ['REINF'], re: /reinf/i, conteudo: ['"Recibo de Entrega da EFD-Reinf"'] },
      DARF: { qs: ['DARF'], re: /darf/i },
      ICMS: { qs: ['GIA', 'GARE', 'ICMS'], re: /(^|[^a-z])gia|gare|icms/i },
      ESOCIAL: { qs: ['eSocial'], re: /esocial|esoc/i },
    };
    const entregas = new Map<string, Set<string>>();
    let arquivosVistos = 0, semCliente = 0, semComp = 0, nomeNaoConfere = 0;
    // Search API tem teto de ~3000 por query → particiona por MÊS via KQL LastModifiedTime
    // (janela mensal cabe sempre abaixo do teto, mesmo em tipos volumosos como DAS). Dedup por
    // caminho+nome. Competência sai sempre do PATH (arquivo modificado no mês seguinte ao da comp).
    const proxMes = (y: number, m: number) => (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`);
    for (const [tipo, cfg] of Object.entries(termos)) {
      const vistos = new Set<string>();
      for (const q of cfg.qs) {
        for (const { y, m } of janelas) {
          const mm = String(m).padStart(2, '0');
          const kql = `${q} LastModifiedTime>=${y}-${mm}-01 AND LastModifiedTime<${proxMes(y, m)}`;
          let arquivos: Array<{ name: string; path: string }> = [];
          try { arquivos = (await this.onedrive.coletaTenant(conn.id, kql, { maxItens: 3000 })).itens; } catch { continue; }
          for (const f of arquivos) {
            const chave = `${f.path}/${f.name}`;
            if (vistos.has(chave)) continue; vistos.add(chave);
            arquivosVistos++;
            // valida que o NOME do arquivo confirma o tipo (evita falso positivo da busca ampla)
            if (!cfg.re.test(f.name || '')) { nomeNaoConfere++; continue; }
            const cid = resolveClient(f.path || '');
            if (!cid) { semCliente++; continue; }
            const comp = extractComp(norm(`${f.name} ${f.path}`));
            if (!comp) { semComp++; continue; }
            if (!entregas.has(cid)) entregas.set(cid, new Set());
            entregas.get(cid)!.add(`${tipo}|${comp}`);
          }
        }
      }
      // BUSCA POR CONTEÚDO (frase interna do PDF) — pega recibos de qualquer nome. Sem validação
      // de nome: a frase indexada já prova o tipo. Competência vem da PASTA (path).
      for (const q of (cfg.conteudo ?? [])) {
        for (const { y, m } of janelas) {
          const mm = String(m).padStart(2, '0');
          const kql = `${q} AND LastModifiedTime>=${y}-${mm}-01 AND LastModifiedTime<${proxMes(y, m)}`;
          let arquivos: Array<{ name: string; path: string }> = [];
          try { arquivos = (await this.onedrive.coletaTenant(conn.id, kql, { maxItens: 3000 })).itens; } catch { continue; }
          for (const f of arquivos) {
            const chave = `C:${f.path}/${f.name}`;
            if (vistos.has(chave)) continue; vistos.add(chave);
            arquivosVistos++;
            const cid = resolveClient(f.path || '');
            if (!cid) { semCliente++; continue; }
            const comp = extractComp(norm(`${f.name} ${f.path}`)) || extractComp(norm(f.path));
            if (!comp) { semComp++; continue; }
            if (!entregas.has(cid)) entregas.set(cid, new Set());
            entregas.get(cid)!.add(`${tipo}|${comp}`);
          }
        }
      }
    }

    // aplica às obrigações — ADITIVO: só marca ENTREGUE onde há prova (não cria vencida
    // falsa quando o casamento não acha; a ausência de match não prova não-entrega).
    let entregue = 0;
    const anosStr = anos.map(String);
    const itens = await this.prisma.fiscalCalendarItem.findMany({
      where: { status: { in: ['pendente', 'vencida'] }, OR: anosStr.map((a) => ({ competencia: { startsWith: a } })) },
      select: { id: true, companyId: true, tipo: true, competencia: true },
    });
    for (const it of itens) {
      const set = entregas.get(it.companyId);
      if (set && set.has(`${it.tipo}|${it.competencia}`)) {
        await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: 'entregue' } }).catch(() => undefined);
        entregue++;
      }
    }
    return { anos, arquivosVistos, nomeNaoConfere, semCliente, semComp, clientesComEntrega: entregas.size, obrigacoesAnalisadas: itens.length, marcadasEntregue: entregue };
  }

  /**
   * RECONCILIAÇÃO APP-ONLY (cobertura 100%) — usa o scan completo (getAllSites → drives → delta,
   * permissão de aplicação) e casa os comprovantes por cliente+competência lidos do caminho.
   * É a fonte definitiva: nenhum drive fica de fora. ADITIVO (só marca ENTREGUE com prova).
   */
  async reconciliarAppOnly(opts?: { anos?: number[]; timeBudgetMs?: number }) {
    const anos = opts?.anos ?? [new Date().getFullYear(), new Date().getFullYear() - 1];
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    // tenta APP-ONLY (100% garantido); se não houver permissão de aplicação, cai no DELEGADO
    // (mesma varredura sites→drives→delta, com o token que já temos — NÃO exige nada no Azure).
    const budget = opts?.timeBudgetMs ?? 8 * 60_000;
    let scan: any = null, via = 'app-only';
    try { scan = await this.onedrive.scanCompletoAppOnly({ timeBudgetMs: budget }); }
    catch { scan = { erro: 'app-only indisponível' }; }
    if (!scan || scan.erro) {
      via = 'delegado';
      try { scan = await this.onedrive.scanCompletoDelegado(conn.id, { timeBudgetMs: budget }); }
      catch (e: any) { return { erro: `Scan falhou (app-only e delegado): ${e?.message ?? e}` }; }
      if ((scan as any).erro) return scan;
    }

    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true, name: true, clienteCodigo: true } });
    const porCodigo = new Map<string, string>(); const porNome = new Map<string, string>();
    for (const c of companies) { if (c.clienteCodigo) porCodigo.set(String(c.clienteCodigo), c.id); const n = norm(c.name); if (n) porNome.set(n, c.id); }
    const resolveSeg = (seg: string): string | null => {
      const codeM = seg.match(/^\s*(\d+)\s*[-–]/);
      if (codeM && porCodigo.has(codeM[1])) return porCodigo.get(codeM[1])!;
      const nn = norm(seg.replace(/^\s*\d+\s*[-–]\s*/, '').replace(/\([^)]*\)/g, ''));
      if (nn.length >= 5 && porNome.has(nn)) return porNome.get(nn)!;
      if (nn.length >= 8) for (const [n, id] of porNome) if (n.length >= 8 && (nn.includes(n) || n.includes(nn))) return id;
      return null;
    };
    const resolveClient = (fullPath: string): string | null => { for (const seg of (fullPath || '').split('/')) { const cid = resolveSeg(seg); if (cid) return cid; } return null; };
    const extractComp = (s: string): string | null => {
      for (const y of anos) for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        if (s.includes(`${mm} ${y}`) || s.includes(`${y} ${mm}`) || s.includes(`${mm}${y}`) || (s.includes(MESES[m - 1]) && s.includes(String(y)))) return `${y}-${mm}`;
      }
      return null;
    };
    // detecta o TIPO de obrigação pelo nome do comprovante
    const detectTipo = (n: string): string | null => {
      if (/dasnsimei|\bdasn\b/.test(n)) return 'DASN-SIMEI';
      if (/pgdasd|pgdas|pgmei|\bdas\b|simples nacional|(?:rec\w*|dec\w*|declara\w*|extrato)[\s\-]+sn\b|recibo de pagamento|extrato mensal|(?:dec|declara\w*)[\s\d]*\bsm\b|se?m\s*moviment/.test(n)) return 'DAS';
      if (/dctf/.test(n)) return 'DCTFWeb';
      if (/reinf/.test(n)) return 'EFD_REINF';
      if (/\bgia\b|gare|icms/.test(n)) return 'ICMS';
      if (/\bdarf\b/.test(n)) return 'DARF';
      if (/fgts|\bgrf\b/.test(n)) return 'FGTS';
      if (/esocial|esoc/.test(n)) return 'ESOCIAL';
      if (/defis/.test(n)) return 'DEFIS';
      if (/\becd\b/.test(n)) return 'ECD';
      if (/\becf\b/.test(n)) return 'ECF';
      return null;
    };

    const entregas = new Map<string, Set<string>>();
    let semCliente = 0, semComp = 0, semTipo = 0;
    for (const f of (scan as any).comprovantes as Array<{ name: string; path: string }>) {
      const ntxt = norm(`${f.name} ${f.path}`);
      const tipo = detectTipo(ntxt);
      if (!tipo) { semTipo++; continue; }
      const cid = resolveClient(f.path || '');
      if (!cid) { semCliente++; continue; }
      const comp = tipo === 'DEFIS' || tipo === 'ECD' || tipo === 'ECF' || tipo === 'DASN-SIMEI'
        ? (anos.map(String).find((y) => ntxt.includes(y)) ?? null) // anuais: basta o ano
        : extractComp(ntxt);
      if (!comp) { semComp++; continue; }
      if (!entregas.has(cid)) entregas.set(cid, new Set());
      entregas.get(cid)!.add(`${tipo}|${comp}`);
    }
    const anosStr = anos.map(String);
    const itens = await this.prisma.fiscalCalendarItem.findMany({
      where: { status: { in: ['pendente', 'vencida'] }, OR: anosStr.map((a) => ({ competencia: { startsWith: a } })) },
      select: { id: true, companyId: true, tipo: true, competencia: true },
    });
    let entregue = 0;
    for (const it of itens) {
      const set = entregas.get(it.companyId);
      if (set && set.has(`${it.tipo}|${it.competencia}`)) {
        await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: 'entregue' } }).catch(() => undefined);
        entregue++;
      }
    }
    return {
      anos, fluxo: via === 'delegado' ? 'Delegado (sites→drives→delta, sem Azure)' : 'App-only (getAllSites→drives→delta)',
      sites: (scan as any).sites, drivesConhecidos: (scan as any).drivesConhecidos, drivesVarridos: (scan as any).drivesVarridos, incremental: (scan as any).incremental, parcial: (scan as any).parcial,
      arquivosVistos: (scan as any).arquivosVistos, comprovantesRelevantes: (scan as any).comprovantes.length,
      semTipo, semCliente, semComp, clientesComEntrega: entregas.size, marcadasEntregue: entregue,
    };
  }

  /** Busca global no Drive (Search API) — varre todas as pastas/subpastas por um termo. */
  async buscarNoDrive(query: string, pasta?: string) {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    return this.onedrive.buscarNoDrive(conn.id, query, { pasta });
  }

  /** Busca TENANT-WIDE (Microsoft Search API) — lê tudo do OneDrive numa varredura indexada. */
  async buscaTenant(query: string) {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    return this.onedrive.buscaTenant(conn.id, query);
  }

  /** Enumera sites+drives via permissão de APLICAÇÃO (mede cobertura 100%). */
  async enumerarSitesEDrives() {
    return this.onedrive.enumerarSitesEDrives();
  }

  /**
   * RECONCILIAÇÃO POR CLIENTE (escopada pelo código) — a mais robusta p/ nomes variados: em vez
   * de buscar por palavra da obrigação (a Search API não indexa bem abreviações curtas como "SM"),
   * busca os ARQUIVOS DE CADA CLIENTE pelo código e CLASSIFICA localmente cada nome (regex ampla).
   * Assim pega DAS nomeado "RECIBO SN", "DEC 052026 SM", "sm movimento", etc. Bounded por tempo.
   */
  async reconciliarPorClienteScoped(opts?: { anos?: number[]; timeBudgetMs?: number }) {
    const anos = opts?.anos ?? [new Date().getFullYear()];
    const budget = opts?.timeBudgetMs ?? 10 * 60_000;
    const inicio = Date.now();
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const detectTipo = (n: string): string | null => {
      if (/dasnsimei|\bdasn\b/.test(n)) return 'DASN-SIMEI';
      if (/pgdasd|pgdas|pgmei|\bdas\b|simples nacional|(?:rec\w*|dec\w*|declara\w*|extrato)[\s-]+sn\b|recibo de pagamento|extrato mensal|(?:dec|declara\w*)[\s\d]*\bsm\b|se?m\s*moviment/.test(n)) return 'DAS';
      if (/dctf/.test(n)) return 'DCTFWeb';
      if (/reinf/.test(n)) return 'EFD_REINF';
      if (/\bgia\b|gare|icms/.test(n)) return 'ICMS';
      if (/defis/.test(n)) return 'DEFIS';
      return null;
    };
    const extractComp = (s: string): string | null => {
      for (const y of anos) for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        if (s.includes(`${mm} ${y}`) || s.includes(`${y} ${mm}`) || s.includes(`${mm}${y}`) || s.includes(`${y}${mm}`) || (s.includes(MESES[m - 1]) && s.includes(String(y)))) return `${y}-${mm}`;
      }
      return null;
    };
    const companies = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null }, sharepointDriveId: { not: null } },
      select: { id: true, name: true, sharepointItemId: true, sharepointDriveId: true },
      orderBy: { updatedAt: 'asc' }, // rotação: menos-recentes primeiro (avança a cada rodada)
    });
    const entregas = new Map<string, Set<string>>();
    let clientesVarridos = 0, arquivos = 0, semComp = 0, zipsLidos = 0, parcial = false;
    for (const c of companies) {
      if (Date.now() - inicio > budget) { parcial = true; break; }
      // LÊ A PASTA DO CLIENTE (delta) — todos os arquivos com caminho, mesmo os de nome genérico
      // dentro de subpastas (ex.: /2026/05.2026/Obrigacoes/PGDASD-RECIBO.pdf).
      let itens: Array<{ id: string; name: string; driveId: string; path?: string }> = [];
      try { itens = (await this.onedrive.deltaScan(conn.id, c.sharepointDriveId!, c.sharepointItemId!)).arquivos; } catch { continue; }
      clientesVarridos++;
      const add = (tipo: string, comp: string) => { if (!entregas.has(c.id)) entregas.set(c.id, new Set()); entregas.get(c.id)!.add(`${tipo}|${comp}`); };
      const zipsAbertos = new Set<string>();
      for (const f of itens) {
        arquivos++;
        const compArq = extractComp(norm(`${f.name} ${f.path ?? ''}`));
        const tipo = detectTipo(norm(f.name));
        if (tipo) { if (compArq) add(tipo, compArq); else semComp++; }
        // ZIP numa pasta de competência 2026: abre e classifica os nomes internos (recibos compactados)
        if (/\.zip$/i.test(f.name) && compArq && zipsAbertos.size < 40 && Date.now() - inicio < budget) {
          zipsAbertos.add(f.id);
          zipsLidos++;
          let internos: string[] = [];
          try { internos = await this.onedrive.lerNomesZip(conn.id, f.driveId, f.id); } catch { /* ignora */ }
          for (const nm of internos) { const t2 = detectTipo(norm(nm)); if (t2) { const c2 = extractComp(norm(`${nm} ${f.path ?? ''}`)) || compArq; add(t2, c2); } }
        }
      }
      await this.prisma.company.update({ where: { id: c.id }, data: { updatedAt: new Date() } }).catch(() => undefined); // rotaciona
    }
    // aplica (aditivo — só marca ENTREGUE)
    const anosStr = anos.map(String);
    const obr = await this.prisma.fiscalCalendarItem.findMany({
      where: { status: { in: ['pendente', 'vencida'] }, OR: anosStr.map((a) => ({ competencia: { startsWith: a } })) },
      select: { id: true, companyId: true, tipo: true, competencia: true },
    });
    let entregue = 0;
    for (const it of obr) {
      const set = entregas.get(it.companyId);
      if (set && set.has(`${it.tipo}|${it.competencia}`)) {
        await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: 'entregue' } }).catch(() => undefined);
        entregue++;
      }
    }
    return { anos, fluxo: 'Por pasta do cliente (delta) + zip + classificação local', clientesVarridos, arquivos, zipsLidos, semComp, parcial, clientesComEntrega: entregas.size, marcadasEntregue: entregue };
  }

  /**
   * LISTADOR DAS PASTAS DE COMPETÊNCIA 2026 — a caça definitiva. A busca acha ALGUM arquivo em
   * cada pasta de competência (um XML, um PGDASD) e isso revela o ID da PASTA. Então LISTA a
   * pasta inteira (delta) e classifica TODO arquivo — pegando os recibos de nome genérico que a
   * busca por palavra não acha (o gap real). Também abre zips. Fonte na localização CERTA de 2026.
   */
  async reconciliarListandoPastas(opts?: { anos?: number[]; timeBudgetMs?: number }) {
    const anos = opts?.anos ?? [new Date().getFullYear()];
    const budget = opts?.timeBudgetMs ?? 12 * 60_000;
    const inicio = Date.now();
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const detectTipo = (n: string): string | null => {
      if (/dasnsimei|\bdasn\b/.test(n)) return 'DASN-SIMEI';
      if (/pgdasd|pgdas|pgmei|\bdas\b|simples nacional|(?:rec\w*|dec\w*|declara\w*|extrato)[\s-]+sn\b|recibo de pagamento|extrato mensal|(?:dec|declara\w*)[\s\d]*\bsm\b|se?m\s*moviment/.test(n)) return 'DAS';
      if (/dctf/.test(n)) return 'DCTFWeb';
      if (/reinf/.test(n)) return 'EFD_REINF';
      if (/\bgia\b|gare|icms/.test(n)) return 'ICMS';
      if (/defis/.test(n)) return 'DEFIS';
      return null;
    };
    const extractComp = (s: string): string | null => {
      for (const y of anos) for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        if (s.includes(`${mm} ${y}`) || s.includes(`${y} ${mm}`) || s.includes(`${mm}${y}`) || s.includes(`${y}${mm}`) || (s.includes(MESES[m - 1]) && s.includes(String(y)))) return `${y}-${mm}`;
      }
      return null;
    };
    // resolução de cliente pelo caminho
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true, name: true, clienteCodigo: true } });
    const porCodigo = new Map<string, string>(); const porNome = new Map<string, string>();
    for (const c of companies) { if (c.clienteCodigo) porCodigo.set(String(c.clienteCodigo), c.id); const n = norm(c.name); if (n) porNome.set(n, c.id); }
    const resolveClient = (fullPath: string): string | null => {
      for (const seg of (fullPath || '').split('/')) {
        const codeM = seg.match(/^\s*(\d+)\s*[-–]/); if (codeM && porCodigo.has(codeM[1])) return porCodigo.get(codeM[1])!;
        const nn = norm(seg.replace(/^\s*\d+\s*[-–]\s*/, '').replace(/\([^)]*\)/g, ''));
        if (nn.length >= 5 && porNome.has(nn)) return porNome.get(nn)!;
        if (nn.length >= 8) for (const [n, id] of porNome) if (n.length >= 8 && (nn.includes(n) || n.includes(nn))) return id;
      }
      return null;
    };
    // 1. DESCOBRE as pastas de competência 2026 (via qualquer arquivo achável nelas)
    const pastas = new Map<string, { driveId: string; parentId: string; path: string }>();
    const proxMes = (y: number, m: number) => (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`);
    const descoberta = ['PGDASD', 'DAS', 'Simples Nacional', 'DCTF', 'GIA', 'REINF', 'PGMEI', 'recibo', 'extrato', 'declaracao'];
    for (const q of descoberta) {
      if (Date.now() - inicio > budget * 0.5) break; // metade do tempo p/ descobrir, metade p/ listar
      for (const y of anos) for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const kql = `${q} LastModifiedTime>=${y}-${mm}-01 AND LastModifiedTime<${proxMes(y, m)}`;
        let itens: any[] = [];
        try { itens = (await this.onedrive.coletaTenant(conn.id, kql, { maxItens: 2000 })).itens; } catch { continue; }
        for (const f of itens) {
          if (!f.driveId || !f.parentId) continue;
          if (!/2026/.test(f.path || '')) continue; // só pastas de 2026
          pastas.set(`${f.driveId}|${f.parentId}`, { driveId: f.driveId, parentId: f.parentId, path: f.path });
        }
      }
    }
    // 2. LISTA cada pasta descoberta e classifica TODO arquivo (pega os de nome genérico)
    const entregas = new Map<string, Set<string>>();
    let pastasListadas = 0, arquivos = 0, zipsLidos = 0, parcial = false;
    for (const { driveId, parentId, path } of pastas.values()) {
      if (Date.now() - inicio > budget) { parcial = true; break; }
      const cid = resolveClient(path);
      if (!cid) continue;
      let children: Array<{ id: string; name: string; driveId: string; path?: string }> = [];
      try { children = (await this.onedrive.deltaScan(conn.id, driveId, parentId)).arquivos; } catch { continue; }
      pastasListadas++;
      const add = (tipo: string, comp: string) => { if (!entregas.has(cid)) entregas.set(cid, new Set()); entregas.get(cid)!.add(`${tipo}|${comp}`); };
      for (const ch of children) {
        arquivos++;
        const compArq = extractComp(norm(`${ch.name} ${ch.path ?? path}`)) || extractComp(norm(path));
        const tipo = detectTipo(norm(ch.name));
        if (tipo && compArq) add(tipo, compArq);
        if (/\.zip$/i.test(ch.name) && compArq && zipsLidos < 60 && Date.now() - inicio < budget) {
          zipsLidos++;
          let internos: string[] = [];
          try { internos = await this.onedrive.lerNomesZip(conn.id, ch.driveId, ch.id); } catch { /* ignora */ }
          for (const nm of internos) { const t2 = detectTipo(norm(nm)); if (t2) add(t2, extractComp(norm(nm)) || compArq); }
        }
      }
    }
    // 3. aplica (aditivo)
    const anosStr = anos.map(String);
    const obr = await this.prisma.fiscalCalendarItem.findMany({
      where: { status: { in: ['pendente', 'vencida'] }, OR: anosStr.map((a) => ({ competencia: { startsWith: a } })) },
      select: { id: true, companyId: true, tipo: true, competencia: true },
    });
    let entregue = 0;
    for (const it of obr) {
      const set = entregas.get(it.companyId);
      if (set && set.has(`${it.tipo}|${it.competencia}`)) { await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: 'entregue' } }).catch(() => undefined); entregue++; }
    }
    return { anos, fluxo: 'Listador de pastas 2026 (descobre pasta + lista tudo + zip)', pastasDescobertas: pastas.size, pastasListadas, arquivos, zipsLidos, parcial, clientesComEntrega: entregas.size, marcadasEntregue: entregue };
  }

  /**
   * DIAGNÓSTICO do gap de DAS — pega clientes do Simples/MEI com DAS VENCIDO num mês passado e
   * LISTA o conteúdo REAL da pasta deles naquele mês (via Search API), pra revelar por que o
   * recibo não casou: nome diferente? dentro de zip? subpasta? ou realmente ausente?
   */
  async diagnosticarDasFaltante(ano = new Date().getFullYear(), amostra = 6) {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // clientes Simples/MEI com DAS vencido
    const simples = await this.prisma.company.findMany({
      where: { active: true, OR: [{ taxRegime: { contains: 'SIMPLES' } }, { taxRegime: { contains: 'MEI' } }] },
      select: { id: true, name: true, clienteCodigo: true, taxRegime: true },
    });
    const byId = new Map(simples.map((c) => [c.id, c]));
    const vencidos = await this.prisma.fiscalCalendarItem.findMany({
      where: { companyId: { in: simples.map((c) => c.id) }, tipo: 'DAS', status: 'vencida', competencia: { startsWith: `${ano}-` } },
      select: { companyId: true, competencia: true },
    });
    // agrupa meses vencidos por cliente
    const porCliente = new Map<string, string[]>();
    for (const v of vencidos) { if (!porCliente.has(v.companyId)) porCliente.set(v.companyId, []); porCliente.get(v.companyId)!.push(v.competencia); }
    const alvos = [...porCliente.entries()].slice(0, amostra);
    const resultado: any[] = [];
    for (const [cid, meses] of alvos) {
      const c = byId.get(cid)!;
      const cod = c.clienteCodigo ? String(c.clienteCodigo) : null;
      // busca ampla pelo código do cliente (aparece no caminho "NNN - NOME")
      const termo = cod || (c.name.split(/\s+/).find((w) => w.length >= 5) ?? c.name);
      let itens: Array<{ name: string; path: string }> = [];
      try { itens = (await this.onedrive.coletaTenant(conn.id, `${termo} LastModifiedTime>=${ano}-01-01`, { maxItens: 400 })).itens; } catch { /* segue */ }
      // filtra os arquivos que são deste cliente (path contém o código "NNN -" ou o nome)
      const nn = norm(c.name);
      const doCliente = itens.filter((f) => {
        const p = f.path || '';
        if (cod && new RegExp(`(^|/)\\s*${cod}\\s*[-–]`).test(p)) return true;
        return nn.length >= 6 && norm(p).includes(nn.slice(0, 12));
      });
      // agrupa por mês (pasta MM.YYYY) e lista nomes
      const porMes: Record<string, string[]> = {};
      for (const f of doCliente) {
        const mm = (`${f.name} ${f.path}`.match(/(0[1-9]|1[0-2])[.\-\/ ]?20\d\d/) || [])[0] ?? 'sem-mes';
        (porMes[mm] ??= []).push(f.name);
      }
      resultado.push({
        codigo: cod, cliente: c.name, regime: c.taxRegime,
        mesesVencidos: meses.sort(),
        arquivosDoCliente: doCliente.length,
        porMes: Object.fromEntries(Object.entries(porMes).map(([k, v]) => [k, v.slice(0, 12)])),
      });
    }
    return { ano, clientesComDasVencido: porCliente.size, amostraInvestigada: resultado.length, clientes: resultado };
  }

  /** Link de consentimento de admin p/ liberar as permissões de aplicação. */
  adminConsentUrl() {
    return this.onedrive.adminConsentUrl();
  }

  /** Realinha clientes ativos pelas pastas de "Empresas Ativas" (reativa os reais removidos). */
  async realinharCarteira() {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    return this.onedrive.realinharPelaCarteira(conn.id);
  }

  /** Refresca os links de pasta de todos os clientes (corrige itemId obsoleto → pasta certa). */
  async refrescarPastas() {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    return this.onedrive.refrescarPastasCarteira(conn.id);
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

  /**
   * VARREDURA PROFUNDA AO VIVO de uma amostra de clientes — lista recursivamente TODAS as
   * pastas/arquivos e compara com o que o sistema capturou. Revela se o scanner está
   * perdendo comprovantes (ex.: de 2026) que existem no OneDrive.
   */
  async escanearProfundoAmostra(n = 6) {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const empresas = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } },
      select: { id: true, name: true, sharepointDriveId: true, sharepointItemId: true },
      take: n, orderBy: { name: 'asc' },
    });
    const resultado: any[] = [];
    for (const e of empresas) {
      const arquivos: Array<{ name: string; path: string }> = [];
      let chamadas = 0, erro: string | null = null;
      const walk = async (driveId: string, folderId: string, path: string, depth: number): Promise<void> => {
        if (depth > 7 || arquivos.length > 4000 || chamadas > 300) return;
        chamadas++;
        let filhos: any[] = [];
        try { filhos = await this.onedrive.listAllChildren(conn.id, driveId, folderId); }
        catch (er: any) { erro = (er?.message ?? 'erro').slice(0, 60); return; }
        for (const f of filhos) {
          if (f.isFolder) await walk(driveId, f.id, `${path}/${f.name}`, depth + 1);
          else arquivos.push({ name: f.name, path });
        }
      };
      try { await walk(e.sharepointDriveId!, e.sharepointItemId!, '', 0); } catch { /* segue */ }
      const tem2026 = arquivos.filter((a) => a.path.includes('2026'));
      const pgdas = arquivos.filter((a) => /pgdas/i.test(a.name));
      const pgdas2026 = pgdas.filter((a) => a.path.includes('2026'));
      const dbTotal = await this.prisma.document.count({ where: { companyId: e.id } });
      const dbCom2026 = await this.prisma.document.count({ where: { companyId: e.id, folderPath: { contains: '2026' } } });
      resultado.push({
        cliente: e.name, chamadasGraph: chamadas, erro,
        arquivosNoDrive: arquivos.length, com2026NoDrive: tem2026.length, pgdasTotal: pgdas.length, pgdas2026NoDrive: pgdas2026.length,
        noBanco: dbTotal, noBancoCom2026: dbCom2026,
        amostraPastas2026: [...new Set(tem2026.map((a) => a.path.slice(-55)))].slice(0, 5),
        amostraPgdas2026: pgdas2026.slice(0, 3).map((a) => `${a.path.slice(-40)} / ${a.name.slice(0, 30)}`),
      });
    }
    return { clientes: resultado };
  }

  /**
   * TESTE DO SCANNER DE PRODUÇÃO (delta): roda o deltaScan FULL (sem deltaLink) numa
   * amostra e mostra quantos arquivos ele acha AGORA, quantos referenciam 2026 e amostra
   * de pastas — usando exatamente o mecanismo que captura. Definitivo p/ saber se o delta
   * está achando (ou não) os comprovantes de 2026 que existem no Drive.
   */
  async escanearDeltaAmostra(n = 6) {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return { erro: 'Nenhuma conexão OneDrive ativa.' };
    const empresas = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } },
      select: { id: true, name: true, sharepointDriveId: true, sharepointItemId: true },
      take: n, orderBy: { name: 'asc' },
    });
    const out: any[] = [];
    for (const e of empresas) {
      try {
        const { arquivos } = await this.onedrive.deltaScan(conn.id, e.sharepointDriveId!, e.sharepointItemId!, undefined);
        const com2026 = arquivos.filter((a: any) => (a.path ?? '').includes('2026'));
        const pgdas2026 = arquivos.filter((a: any) => /pgdas/i.test(a.name) && (a.path ?? '').includes('2026'));
        out.push({
          cliente: e.name,
          arquivosDelta: arquivos.length,
          com2026: com2026.length,
          pgdas2026: pgdas2026.length,
          amostraPastas: [...new Set(arquivos.map((a: any) => (a.path ?? '').slice(-50)))].slice(0, 6),
          amostra2026: [...new Set(com2026.map((a: any) => (a.path ?? '').slice(-50)))].slice(0, 4),
        });
      } catch (er: any) { out.push({ cliente: e.name, erro: (er?.message ?? 'erro').slice(0, 80) }); }
    }
    return { clientes: out };
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
