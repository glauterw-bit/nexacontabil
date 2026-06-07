import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client, JWT } from 'google-auth-library';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from './crypto.util';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',          // full
  'https://www.googleapis.com/auth/userinfo.email',
];

const REDIRECT_PATH = '/api/v1/cloud/google/callback';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getOAuthClient(redirectBase?: string): OAuth2Client {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!id || !secret) throw new BadRequestException('Google OAuth nao configurado (GOOGLE_CLIENT_ID/SECRET)');
    const base = redirectBase || process.env.BACKEND_BASE_URL || 'https://backend-production-9eeec.up.railway.app';
    return new google.auth.OAuth2(id, secret, base + REDIRECT_PATH);
  }

  generateAuthUrl(state: string, redirectBase?: string): string {
    const client = this.getOAuthClient(redirectBase);
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      prompt: 'consent', // garante refresh_token
      state,
    });
  }

  async exchangeCode(code: string, userId: string, label: string, rootFolderId?: string, redirectBase?: string) {
    const client = this.getOAuthClient(redirectBase);
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new BadRequestException('Sem access_token');

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    return this.prisma.cloudConnection.create({
      data: {
        provider: 'google_drive',
        label,
        accountEmail: userInfo.data.email ?? 'unknown',
        scope: 'full',
        encryptedAccessToken: encryptToken(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
        rootFolderId,
        createdById: userId,
      },
    });
  }

  // ─── Conta de Serviço (Service Account) ──────────────────────
  // Permite o app ler uma pasta SEM senha e SEM tela de login:
  // basta compartilhar a pasta do Drive com o e-mail da conta de serviço.

  private getServiceAccountKey(): { client_email: string; private_key: string } | null {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try {
      // aceita JSON cru ou base64 do JSON
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const j = JSON.parse(json);
      if (j.client_email && j.private_key) {
        return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, '\n') };
      }
    } catch { /* ignore */ }
    return null;
  }

  /** E-mail da conta de serviço — é com ELE que o usuário compartilha a pasta. */
  getServiceAccountEmail(): string | null {
    return this.getServiceAccountKey()?.client_email ?? null;
  }

  private serviceAccountAuth(): JWT {
    const key = this.getServiceAccountKey();
    if (!key) throw new BadRequestException('Conta de serviço Google não configurada (GOOGLE_SERVICE_ACCOUNT_JSON no Railway).');
    return new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }

  /** Registra uma conexão que usa a conta de serviço pra ler uma pasta compartilhada. */
  async createServiceAccountConnection(userId: string, label: string, rootFolderId?: string) {
    const key = this.getServiceAccountKey();
    if (!key) throw new BadRequestException('Configure GOOGLE_SERVICE_ACCOUNT_JSON no Railway primeiro.');
    // valida acesso real à pasta antes de salvar
    if (rootFolderId) {
      try {
        const drive = google.drive({ version: 'v3', auth: this.serviceAccountAuth() });
        await drive.files.get({ fileId: rootFolderId, fields: 'id, name', supportsAllDrives: true });
      } catch {
        throw new BadRequestException('Não consegui acessar essa pasta. Compartilhe a pasta do Drive com ' + key.client_email + ' (permissão Leitor) e tente de novo.');
      }
    }
    return this.prisma.cloudConnection.create({
      data: {
        provider: 'google_service_account',
        label,
        accountEmail: key.client_email,
        scope: 'full',
        encryptedAccessToken: encryptToken('service-account'),
        encryptedRefreshToken: null,
        tokenExpiresAt: new Date('2099-01-01'),
        rootFolderId,
        createdById: userId,
      },
    });
  }

  private async getAuthedClient(connectionId: string): Promise<OAuth2Client | JWT> {
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new BadRequestException('Conexao Google nao encontrada');
    if (conn.provider === 'google_service_account') return this.serviceAccountAuth();
    if (conn.provider !== 'google_drive') throw new BadRequestException('Conexao Google nao encontrada');
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: decryptToken(conn.encryptedAccessToken),
      refresh_token: conn.encryptedRefreshToken ? decryptToken(conn.encryptedRefreshToken) : undefined,
      expiry_date: conn.tokenExpiresAt.getTime(),
    });

    // listener para salvar token refrescado
    client.on('tokens', async (newTokens) => {
      const updates: any = { updatedAt: new Date() };
      if (newTokens.access_token) updates.encryptedAccessToken = encryptToken(newTokens.access_token);
      if (newTokens.refresh_token) updates.encryptedRefreshToken = encryptToken(newTokens.refresh_token);
      if (newTokens.expiry_date) updates.tokenExpiresAt = new Date(newTokens.expiry_date);
      await this.prisma.cloudConnection.update({ where: { id: connectionId }, data: updates });
    });

    return client;
  }

  async search(connectionId: string, opts: { q?: string; mimeType?: string; folderId?: string; pageSize?: number } = {}) {
    const auth = await this.getAuthedClient(connectionId);
    const drive = google.drive({ version: 'v3', auth });
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });

    const queryParts: string[] = ['trashed = false'];
    if (opts.q) queryParts.push(`(name contains '${opts.q.replace(/'/g, "\\'")}' or fullText contains '${opts.q.replace(/'/g, "\\'")}')`);
    if (opts.mimeType) queryParts.push(`mimeType = '${opts.mimeType}'`);
    if (opts.folderId) queryParts.push(`'${opts.folderId}' in parents`);
    else if (conn?.rootFolderId) queryParts.push(`'${conn.rootFolderId}' in parents`);

    const res = await drive.files.list({
      q: queryParts.join(' and '),
      pageSize: opts.pageSize ?? 50,
      fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink, parents)',
      orderBy: 'modifiedTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    await this.prisma.cloudConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    });
    return res.data.files ?? [];
  }

  async downloadFile(connectionId: string, fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const auth = await this.getAuthedClient(connectionId);
    const drive = google.drive({ version: 'v3', auth });
    const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType', supportsAllDrives: true });
    const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data as ArrayBuffer);
    return { buffer, mimeType: meta.data.mimeType ?? 'application/octet-stream', name: meta.data.name ?? 'file' };
  }

  async uploadFile(connectionId: string, params: { name: string; mimeType: string; data: Buffer; folderId?: string }) {
    const auth = await this.getAuthedClient(connectionId);
    const drive = google.drive({ version: 'v3', auth });
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });
    const parent = params.folderId ?? conn?.rootFolderId ?? undefined;
    return drive.files.create({
      requestBody: {
        name: params.name,
        mimeType: params.mimeType,
        ...(parent ? { parents: [parent] } : {}),
      },
      media: {
        mimeType: params.mimeType,
        body: require('stream').Readable.from(params.data),
      },
      fields: 'id, name, webViewLink',
    });
  }
}
