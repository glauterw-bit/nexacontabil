import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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

  private async getAuthedClient(connectionId: string): Promise<OAuth2Client> {
    const conn = await this.prisma.cloudConnection.findUnique({ where: { id: connectionId } });
    if (!conn || conn.provider !== 'google_drive') throw new BadRequestException('Conexao Google nao encontrada');
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
    const meta = await drive.files.get({ fileId, fields: 'id, name, mimeType' });
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
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
