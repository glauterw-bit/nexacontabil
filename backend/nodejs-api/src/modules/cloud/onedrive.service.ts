import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from './crypto.util';

const SCOPES = ['Files.ReadWrite.All', 'User.Read', 'offline_access'];
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

  async exchangeCode(code: string, userId: string, label: string, rootFolderId?: string, redirectBase?: string) {
    const msal = this.getMsal();
    const result = await msal.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: this.redirectUri(redirectBase),
    });
    if (!result?.accessToken) throw new BadRequestException('Sem accessToken da Microsoft');

    const email = result.account?.username ?? 'unknown';
    // refresh token nao vem na response do MSAL high level; precisamos da raw response
    // MSAL cache mantem refresh internamente. Aqui salvamos o access + expiresOn.
    return this.prisma.cloudConnection.create({
      data: {
        provider: 'microsoft_onedrive',
        label,
        accountEmail: email,
        scope: 'full',
        encryptedAccessToken: encryptToken(result.accessToken),
        encryptedRefreshToken: null, // MSAL renova internamente via tokenCache
        tokenExpiresAt: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
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
    // tentar renovar via msal silent
    const msal = this.getMsal();
    const accounts = await msal.getTokenCache().getAllAccounts();
    const account = accounts.find((a) => a.username === conn.accountEmail);
    if (!account) {
      throw new BadRequestException('Token expirado e conta nao encontrada no cache MSAL. Reconecte.');
    }
    const result = await msal.acquireTokenSilent({ account, scopes: SCOPES });
    if (!result?.accessToken) throw new BadRequestException('Falha ao renovar token');
    await this.prisma.cloudConnection.update({
      where: { id: connectionId },
      data: {
        encryptedAccessToken: encryptToken(result.accessToken),
        tokenExpiresAt: result.expiresOn ?? new Date(Date.now() + 3600 * 1000),
      },
    });
    return result.accessToken;
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
