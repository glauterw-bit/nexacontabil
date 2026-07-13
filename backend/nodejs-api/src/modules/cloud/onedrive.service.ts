import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from './crypto.util';

const SCOPES = ['Files.ReadWrite.All', 'Sites.Read.All', 'User.Read', 'offline_access'];
const REDIRECT_PATH = '/api/v1/cloud/microsoft/callback';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

@Injectable()
export class OneDriveService {
  private readonly logger = new Logger(OneDriveService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getMsal(): ConfidentialClientApplication {
    const id = process.env.MICROSOFT_CLIENT_ID;
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
    if (!id || !secret) throw new BadRequestException('Microsoft OAuth nao configurado (MICROSOFT_CLIENT_ID/SECRET)');
    return new ConfidentialClientApplication({
      auth: { clientId: id, clientSecret: secret, authority: `https://login.microsoftonline.com/${tenant}` },
    });
  }

  private redirectUri(base?: string) {
    return (base || process.env.BACKEND_BASE_URL || 'https://backend-production-9eeec.up.railway.app') + REDIRECT_PATH;
  }

  async generateAuthUrl(state: string, redirectBase?: string): Promise<string> {
    const msal = this.getMsal();
    return msal.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: this.redirectUri(redirectBase),
      state,
      prompt: 'consent',
    });
  }

  private tokenEndpoint() {
    const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  }

  /**
   * Troca o code por tokens via OAuth raw (NÃO MSAL high-level), pra capturar
   * o refresh_token e PERSISTIR no banco. Assim a conexão sobrevive a restarts.
   */
  async exchangeCode(code: string, userId: string, label: string, rootFolderId?: string, redirectBase?: string) {
    const id = process.env.MICROSOFT_CLIENT_ID;
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!id || !secret) throw new BadRequestException('Microsoft OAuth nao configurado (MICROSOFT_CLIENT_ID/SECRET)');

    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(redirectBase),
      client_id: id, client_secret: secret, scope: SCOPES.join(' '),
    });
    const r = await fetch(this.tokenEndpoint(), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
    if (!r.ok) throw new BadRequestException(`Microsoft token: ${r.status} ${(await r.text()).slice(0, 250)}`);
    const t: any = await r.json();
    if (!t.access_token) throw new BadRequestException('Sem access_token da Microsoft');

    let email = 'unknown';
    try {
      const me: any = await fetch(`${GRAPH_BASE}/me`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((x) => x.json());
      email = me.userPrincipalName ?? me.mail ?? 'unknown';
    } catch { /* ignore */ }

    return this.prisma.cloudConnection.create({
      data: {
        provider: 'microsoft_onedrive',
        label,
        accountEmail: email,
        scope: 'full',
        encryptedAccessToken: encryptToken(t.access_token),
        encryptedRefreshToken: t.refresh_token ? encryptToken(t.refresh_token) : null,
        tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
        rootFolderId,
        createdById: userId,
      },
    });
  }

  private async getValidToken(connectionId: string): Promise<string> {
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new BadRequestException('Conexao nao encontrada');
    if (conn.tokenExpiresAt > new Date(Date.now() + 60 * 1000)) {
      return decryptToken(conn.encryptedAccessToken);
    }
    if (!conn.encryptedRefreshToken) {
      throw new BadRequestException('Conexão OneDrive sem refresh token — reconecte uma vez (agora persiste).');
    }
    const id = process.env.MICROSOFT_CLIENT_ID;
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: decryptToken(conn.encryptedRefreshToken),
      client_id: id!, client_secret: secret!, scope: SCOPES.join(' '),
    });
    const r = await fetch(this.tokenEndpoint(), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
    if (!r.ok) throw new BadRequestException(`Renovação OneDrive falhou: ${r.status} ${(await r.text()).slice(0, 200)} — reconecte.`);
    const t: any = await r.json();
    await this.prisma.cloudConnection.update({
      where: { id: connectionId },
      data: {
        encryptedAccessToken: encryptToken(t.access_token),
        encryptedRefreshToken: t.refresh_token ? encryptToken(t.refresh_token) : conn.encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
      },
    });
    return t.access_token;
  }

  /** Varre os sites do SharePoint (Acesso rápido) e suas bibliotecas de documentos. */
  async scanSharePoint(connectionId: string) {
    const token = await this.getValidToken(connectionId);
    const tryGet = async (url: string) => {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null, text: r.ok ? '' : (await r.text()).slice(0, 200) };
    };

    let sites: any[] = [];
    let erro: string | null = null;
    // 1. sites seguidos (Acesso rápido)
    const f = await tryGet(`${GRAPH_BASE}/me/followedSites`);
    if (f.ok) sites = f.json.value ?? [];
    else erro = `followedSites: ${f.status} ${f.text}`;
    // 2. fallback: busca todos os sites
    if (!sites.length) {
      const s = await tryGet(`${GRAPH_BASE}/sites?search=*`);
      if (s.ok) sites = s.json.value ?? [];
      else if (!erro) erro = `sites?search: ${s.status} ${s.text}`;
    }

    const out: any[] = [];
    for (const s of sites.slice(0, 25)) {
      const dr = await tryGet(`${GRAPH_BASE}/sites/${s.id}/drives`);
      const drives = dr.ok ? (dr.json.value ?? []).map((d: any) => ({ driveId: d.id, name: d.name, webUrl: d.webUrl })) : [];
      out.push({ siteId: s.id, name: s.displayName ?? s.name, webUrl: s.webUrl, drives });
    }
    return { sites: out, total: out.length, erro: out.length ? null : erro };
  }

  /** Lista TODOS os filhos de um drive/pasta paginando via @odata.nextLink. */
  async listAllChildren(connectionId: string, driveId?: string, folderId?: string) {
    const token = await this.getValidToken(connectionId);
    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}` : `${GRAPH_BASE}/me/drive`;
    const q = '$top=200&$orderby=lastModifiedDateTime%20desc';
    let url: string | null = folderId ? `${base}/items/${folderId}/children?${q}` : `${base}/root/children?${q}`;
    const out: any[] = [];
    let guard = 0;
    let triedNoOrder = false;
    while (url && guard++ < 60) {
      let res: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      // alguns drives rejeitam $orderby em children — cai para sem ordenação uma vez
      if (!res.ok && !triedNoOrder) {
        triedNoOrder = true;
        url = folderId ? `${base}/items/${folderId}/children?$top=200` : `${base}/root/children?$top=200`;
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (!res.ok) break;
      const json: any = await res.json();
      for (const item of (json.value ?? [])) {
        out.push({ id: item.id, name: item.name, isFolder: !!item.folder, childCount: item.folder?.childCount ?? 0, mimeType: item.file?.mimeType, size: item.size, modified: item.lastModifiedDateTime ?? null, driveId });
      }
      url = json['@odata.nextLink'] ?? null;
    }
    return out;
  }

  /**
   * DELTA QUERY do Graph — a forma EFICIENTE e em tempo real. Uma chamada retorna TODOS
   * os arquivos descendentes da pasta (recursivo, sem BFS nem teto); com o deltaLink
   * guardado, as próximas retornam SÓ o que mudou. Devolve os arquivos + o novo deltaLink.
   */
  async deltaScan(connectionId: string, driveId: string, folderId: string, deltaLink?: string) {
    const token = await this.getValidToken(connectionId);
    const base = `${GRAPH_BASE}/drives/${driveId}`;
    let url: string | null = deltaLink || `${base}/items/${folderId}/delta?$top=500`;
    const arquivos: Array<{ id: string; name: string; driveId: string; modified: string | null }> = [];
    let novoDeltaLink: string | null = deltaLink ?? null;
    let guard = 0, primeira = true;
    while (url && guard++ < 400) {
      const res: any = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        // deltaLink expirado (410 Gone) → recomeça leitura completa da pasta uma vez
        if (primeira && deltaLink) { primeira = false; url = `${base}/items/${folderId}/delta?$top=500`; continue; }
        // NÃO engolir o erro: `break` silencioso deixava o cliente órfão para sempre
        // (sem deltaLink, sem diagnóstico, girando na fila). Agora o erro sobe e aparece.
        const corpo = await res.text().catch(() => '');
        throw new Error(`Graph delta HTTP ${res.status}: ${corpo.slice(0, 160)}`);
      }
      primeira = false;
      const json: any = await res.json();
      for (const item of (json.value ?? [])) {
        if (item.deleted || item.folder || !item.file) continue; // só arquivos, ignora pastas/removidos
        arquivos.push({ id: item.id, name: item.name, driveId, modified: item.lastModifiedDateTime ?? null });
      }
      if (json['@odata.nextLink']) url = json['@odata.nextLink'];
      else { novoDeltaLink = json['@odata.deltaLink'] ?? novoDeltaLink; url = null; }
    }
    return { arquivos, deltaLink: novoDeltaLink };
  }

  /** Coleta recursivamente arquivos (por extensão) dentro de uma pasta. */
  async coletarArquivos(connectionId: string, driveId: string, folderId: string, opts: { ext?: string[]; maxFiles?: number; todos?: boolean } = {}) {
    // todos=true → captura QUALQUER arquivo (sem filtro de extensão).
    // senão, além do XML captura PDF/recibos por padrão.
    const ext = opts.ext ?? ['.xml', '.pdf'];
    const pegarTudo = opts.todos === true;
    const maxFiles = opts.maxFiles ?? 150;
    const out: Array<{ id: string; name: string; driveId: string; modified: string | null }> = [];
    // Fila com PRIORIDADE por recência: pastas cujo nome cita um ano/competência
    // mais recente são visitadas primeiro. Assim, ao bater o teto de maxFiles,
    // já capturamos os documentos ATUAIS — não os de 2011. (bug corrigido jul/2026)
    type F = { id: string; name: string };
    let queue: F[] = [{ id: folderId, name: '' }];
    const rank = (name: string) => {
      const s = String(name);
      const ym = s.match(/(20\d{2})[-_./ ]?(0?[1-9]|1[0-2])\b/); // ano+mes
      if (ym) return parseInt(ym[1]) * 100 + parseInt(ym[2]);
      const y = s.match(/\b(20\d{2})\b/);
      if (y) return parseInt(y[1]) * 100 + 50; // ano solto ~ meio do ano
      return 0;
    };
    let guard = 0;
    while (queue.length && out.length < maxFiles && guard++ < 20000) {
      queue.sort((a, b) => rank(b.name) - rank(a.name)); // mais recente primeiro
      const cur = queue.shift()!;
      let items: any[] = [];
      try { items = await this.listAllChildren(connectionId, driveId, cur.id); } catch { continue; }
      for (const it of items) {
        if (it.isFolder) { queue.push({ id: it.id, name: it.name }); continue; }
        const n = (it.name ?? '').toLowerCase();
        if (pegarTudo || ext.some((e) => n.endsWith(e))) {
          out.push({ id: it.id, name: it.name, driveId, modified: it.modified ?? null });
          if (out.length >= maxFiles) break;
        }
      }
    }
    return out;
  }

  /**
   * DIAGNÓSTICO de recência: varre EXAUSTIVAMENTE a pasta de um cliente (sem teto de
   * captura) e reporta os arquivos XML por ANO de modificação + os mais recentes.
   * Responde de forma definitiva se existe QUALQUER arquivo de 2026 no drive do cliente.
   */
  async recenciaDrive(connectionId: string, driveId: string, folderId: string) {
    const porAno: Record<string, number> = {};
    const recentes: Array<{ name: string; modified: string | null }> = [];
    const queue: string[] = [folderId];
    let guard = 0, totalArquivos = 0;
    while (queue.length && guard++ < 4000) {
      const fid = queue.shift()!;
      let items: any[] = [];
      try { items = await this.listAllChildren(connectionId, driveId, fid); } catch { continue; }
      for (const it of items) {
        if (it.isFolder) { queue.push(it.id); continue; }
        if (!/\.(xml)$/i.test(it.name ?? '')) continue;
        totalArquivos++;
        const ano = it.modified ? String(it.modified).slice(0, 4) : 'sem-data';
        porAno[ano] = (porAno[ano] ?? 0) + 1;
        recentes.push({ name: it.name, modified: it.modified ?? null });
      }
    }
    recentes.sort((a, b) => String(b.modified ?? '').localeCompare(String(a.modified ?? '')));
    return { totalArquivos, porAno, arquivos2026: porAno['2026'] ?? 0, recentes: recentes.slice(0, 12) };
  }

  /**
   * VERIFICAÇÃO RÁPIDA "existe 2026?" — varre as pastas de um cliente procurando
   * QUALQUER evidência de 2026 (pasta cujo nome cita 2026, ou arquivo modificado
   * em 2026). Sai assim que acha. Limite de pastas visitadas para caber no tempo
   * de uma requisição HTTP. Prioriza pastas de nome recente.
   */
  async tem2026(connectionId: string, driveId: string, folderId: string) {
    const pastas2026: string[] = [];
    let arquivo2026: { name: string; modified: string } | null = null;
    let maisRecente: string | null = null;
    let pastasVisitadas = 0, arquivosVistos = 0;
    const rank = (name: string) => { const m = String(name).match(/\b(20\d{2})\b/); return m ? parseInt(m[1]) : 0; };
    let queue: { id: string; name: string }[] = [{ id: folderId, name: '' }];
    while (queue.length && pastasVisitadas < 600) {
      queue.sort((a, b) => rank(b.name) - rank(a.name)); // 2026/2025 primeiro
      const cur = queue.shift()!;
      pastasVisitadas++;
      let items: any[] = [];
      try { items = await this.listAllChildren(connectionId, driveId, cur.id); } catch { continue; }
      for (const it of items) {
        if (it.isFolder) {
          if (/\b2026\b/.test(it.name ?? '')) pastas2026.push(it.name);
          queue.push({ id: it.id, name: it.name });
          continue;
        }
        if (!/\.(xml)$/i.test(it.name ?? '')) continue;
        arquivosVistos++;
        const mod = it.modified ? String(it.modified) : '';
        if (mod && (!maisRecente || mod > maisRecente)) maisRecente = mod;
        if (mod.startsWith('2026') && !arquivo2026) arquivo2026 = { name: it.name, modified: mod.slice(0, 10) };
      }
      // saída antecipada: já achamos evidência de 2026 e a pasta raiz cita 2026
      if (arquivo2026 && pastas2026.length) break;
    }
    return {
      tem2026: !!(arquivo2026 || pastas2026.length),
      pastas2026: pastas2026.slice(0, 5),
      arquivo2026,
      maisRecente: maisRecente ? maisRecente.slice(0, 10) : null,
      pastasVisitadas, arquivosVistos,
    };
  }

  /**
   * Análise da carteira: lê os sites "Empresas Ativas/Inativas" do SharePoint,
   * interpreta cada pasta como um cliente (nome + regime + nº de documentos)
   * e devolve a visão agregada pronta pra dashboard.
   */
  async getCarteira(connectionId: string) {
    const scan = await this.scanSharePoint(connectionId);
    if (!scan.sites.length) return { erro: scan.erro ?? 'Nenhum site SharePoint acessível', clientes: [], porRegime: [], totalClientes: 0, totalDocs: 0 };

    const alvo = scan.sites.filter((s: any) => /empresas\s+(ativas|inativas)/i.test(s.name || ''));
    const sites = alvo.length ? alvo : scan.sites;

    const clientes: any[] = [];
    for (const site of sites) {
      const ativo = !/inativ/i.test(site.name); // "Empresas Inativas" → inativo
      for (const drive of (site.drives ?? [])) {
        const items = await this.listAllChildren(connectionId, drive.driveId);
        for (const it of items) {
          if (!it.isFolder) continue;
          const p = parseClienteFolder(it.name);
          clientes.push({
            codigo: p.codigo, nome: p.nome, regime: p.regime, regimeSigla: p.sigla,
            docs: it.childCount ?? 0, ativo, driveId: drive.driveId, itemId: it.id, site: site.name,
          });
        }
      }
    }

    const porRegimeMap: Record<string, { clientes: number; docs: number }> = {};
    let totalDocs = 0;
    for (const c of clientes) {
      totalDocs += c.docs;
      (porRegimeMap[c.regime] ??= { clientes: 0, docs: 0 });
      porRegimeMap[c.regime].clientes++; porRegimeMap[c.regime].docs += c.docs;
    }
    const porRegime = Object.entries(porRegimeMap).map(([regime, v]) => ({ regime, ...v })).sort((a, b) => b.clientes - a.clientes);

    return {
      totalClientes: clientes.length,
      totalDocs,
      ativos: clientes.filter((c) => c.ativo).length,
      inativos: clientes.filter((c) => !c.ativo).length,
      semRegime: clientes.filter((c) => c.regime === 'Não identificado').length,
      semDocs: clientes.filter((c) => c.docs === 0).length,
      porRegime,
      clientes: clientes.sort((a, b) => b.docs - a.docs),
      atualizadoEm: new Date().toISOString(),
    };
  }

  /** Importa os clientes da carteira (SharePoint) como empresas no sistema. */
  async importarCarteira(connectionId: string) {
    const cart: any = await this.getCarteira(connectionId);
    if (cart.erro) return { erro: cart.erro };
    const regimeMap: Record<string, string> = {
      'Simples Nacional': 'SIMPLES_NACIONAL', 'Lucro Presumido': 'LUCRO_PRESUMIDO',
      'Lucro Real': 'LUCRO_REAL', 'MEI': 'MEI', 'Não identificado': 'SIMPLES_NACIONAL',
    };
    let criados = 0, atualizados = 0, erros = 0;
    for (const c of cart.clientes) {
      const regime = regimeMap[c.regime] ?? 'SIMPLES_NACIONAL';
      try {
        const existing = c.itemId
          ? await this.prisma.company.findUnique({ where: { sharepointItemId: c.itemId } })
          : null;
        if (existing) {
          await this.prisma.company.update({
            where: { id: existing.id },
            data: { name: c.nome, taxRegime: regime, clienteCodigo: c.codigo ?? undefined, sharepointDriveId: c.driveId, active: c.ativo },
          });
          atualizados++;
        } else {
          await this.prisma.company.create({
            data: {
              name: c.nome, cnpj: cnpjFromItem(c.itemId ?? `${criados}-${c.nome}`),
              taxRegime: regime, active: c.ativo,
              clienteCodigo: c.codigo ?? undefined,
              sharepointItemId: c.itemId, sharepointDriveId: c.driveId,
            },
          });
          criados++;
        }
      } catch { erros++; }
    }
    return { total: cart.clientes.length, criados, atualizados, erros };
  }

  /** Lista itens compartilhados COM a conta (Compartilhados comigo). */
  async listShared(connectionId: string) {
    const token = await this.getValidToken(connectionId);
    const res = await fetch(`${GRAPH_BASE}/me/drive/sharedWithMe`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new BadRequestException(`Graph API (sharedWithMe): ${res.status}`);
    const json = await res.json();
    return (json.value ?? []).map((item: any) => {
      const r = item.remoteItem ?? item;
      return {
        id: r.id,
        driveId: r.parentReference?.driveId,
        name: item.name ?? r.name,
        isFolder: !!r.folder,
        childCount: r.folder?.childCount ?? undefined,
        mimeType: r.file?.mimeType,
        webViewLink: r.webUrl ?? item.webUrl,
      };
    });
  }

  async search(connectionId: string, opts: { q?: string; pageSize?: number; folderId?: string; driveId?: string } = {}) {
    const token = await this.getValidToken(connectionId);
    const top = opts.pageSize ?? 50;
    const base = opts.driveId ? `${GRAPH_BASE}/drives/${opts.driveId}` : `${GRAPH_BASE}/me/drive`;
    const url = opts.q
      ? `${base}/root/search(q='${encodeURIComponent(opts.q)}')?$top=${top}`
      : opts.folderId
      ? `${base}/items/${opts.folderId}/children?$top=${top}`
      : `${base}/root/children?$top=${top}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new BadRequestException(`Graph API: ${res.status}`);
    const json = await res.json();
    await this.prisma.cloudConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    });
    return (json.value ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType,
      isFolder: !!item.folder,
      childCount: item.folder?.childCount ?? undefined,
      driveId: item.parentReference?.driveId ?? opts.driveId,
      modifiedTime: item.lastModifiedDateTime,
      size: item.size,
      webViewLink: item.webUrl,
    }));
  }

  async downloadFile(connectionId: string, fileId: string, driveId?: string) {
    const token = await this.getValidToken(connectionId);
    const base = driveId ? `${GRAPH_BASE}/drives/${driveId}` : `${GRAPH_BASE}/me/drive`;
    const meta = await fetch(`${base}/items/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    const dl = await fetch(`${base}/items/${fileId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'follow',
    });
    if (!dl.ok) throw new BadRequestException(`Download falhou: ${dl.status}`);
    const arrayBuf = await dl.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: meta.file?.mimeType ?? 'application/octet-stream',
      name: meta.name ?? 'file',
    };
  }

  async uploadFile(connectionId: string, params: { name: string; data: Buffer; mimeType: string; folderId?: string }) {
    const token = await this.getValidToken(connectionId);
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });
    const parent = params.folderId ?? conn?.rootFolderId ?? 'root';
    const url = `${GRAPH_BASE}/me/drive/items/${parent}:/${encodeURIComponent(params.name)}:/content`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': params.mimeType },
      body: new Uint8Array(params.data),
    });
    if (!res.ok) throw new BadRequestException(`Upload falhou: ${res.status}`);
    return res.json();
  }
}

/** CNPJ placeholder determinístico a partir do itemId (único por pasta). */
function cnpjFromItem(seed: string): string {
  let h = 0n;
  for (const ch of seed) h = (h * 131n + BigInt(ch.charCodeAt(0))) % 10000000000000n;
  return '7' + h.toString().padStart(13, '0');
}

/** Interpreta "113 - CLINICA OWEN (SN)" → {codigo, nome, regime, sigla}. */
function parseClienteFolder(raw: string): { codigo: string | null; nome: string; regime: string; sigla: string | null } {
  const nome0 = (raw || '').trim();
  // código no início: "113 - "
  const mCod = nome0.match(/^(\d+)\s*[-–]\s*(.+)$/);
  const codigo = mCod ? mCod[1] : null;
  let resto = mCod ? mCod[2].trim() : nome0;
  // regime entre parênteses no final
  const mReg = resto.match(/\(([^)]*)\)\s*$/);
  let sigla: string | null = null;
  let regime = 'Não identificado';
  if (mReg) {
    const s = mReg[1].trim().toUpperCase();
    if (/\bSN\b/.test(s)) { sigla = 'SN'; regime = 'Simples Nacional'; }
    else if (/\bLP\b/.test(s)) { sigla = 'LP'; regime = 'Lucro Presumido'; }
    else if (/\bLR\b/.test(s)) { sigla = 'LR'; regime = 'Lucro Real'; }
    else if (/\bMEI\b/.test(s)) { sigla = 'MEI'; regime = 'MEI'; }
    if (sigla) resto = resto.replace(/\([^)]*\)\s*$/, '').trim();
  }
  if (/\bMEI\b/i.test(nome0) && regime === 'Não identificado') { regime = 'MEI'; sigla = 'MEI'; }
  return { codigo, nome: resto || nome0, regime, sigla };
}
