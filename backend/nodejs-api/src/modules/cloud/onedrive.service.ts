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

  async search(connectionId: string, opts: { q?: string; pageSize?: number } = {}) {
    const token = await this.getValidToken(connectionId);
    const url = opts.q
      ? `${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(opts.q)}')?$top=${opts.pageSize ?? 50}`
      : `${GRAPH_BASE}/me/drive/root/children?$top=${opts.pageSize ?? 50}`;
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
      modifiedTime: item.lastModifiedDateTime,
      size: item.size,
      webViewLink: item.webUrl,
    }));
  }

  async downloadFile(connectionId: string, fileId: string) {
    const token = await this.getValidToken(connectionId);
    const meta = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());

    const dl = await fetch(`${GRAPH_BASE}/me/drive/items/${fileId}/content`, {
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
