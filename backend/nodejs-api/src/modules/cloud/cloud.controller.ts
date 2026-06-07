import { Controller, Get, Post, Delete, Body, Param, Query, Req, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { GoogleDriveService } from './google-drive.service';
import { OneDriveService } from './onedrive.service';
import { CloudSearchService } from './cloud-search.service';
import { Public } from '../../common/public.decorator';

@Controller('cloud')
export class CloudController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleDriveService,
    private readonly onedrive: OneDriveService,
    private readonly search: CloudSearchService,
  ) {}

  // ─── Conexoes ────────────────────────────────────────────────

  @Get('connections')
  list() {
    return this.prisma.cloudConnection.findMany({
      where: { active: true },
      select: {
        id: true, provider: true, label: true, accountEmail: true,
        scope: true, rootFolderId: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete('connections/:id')
  async revoke(@Param('id') id: string) {
    await this.prisma.cloudConnection.update({
      where: { id },
      data: { active: false },
    });
    return { revoked: true };
  }

  // ─── Conta de Serviço Google (sem login/senha) ──────────────

  /** Retorna o e-mail da conta de serviço — compartilhe a pasta com ele. */
  @Get('google/service-account')
  serviceAccountInfo() {
    const email = this.google.getServiceAccountEmail();
    return { configured: !!email, email };
  }

  /** Registra uma pasta compartilhada com a conta de serviço. */
  @Post('google/service-account/connect')
  async serviceAccountConnect(@Req() req: any, @Body() body: { label?: string; folderId?: string }) {
    const conn = await this.google.createServiceAccountConnection(
      req.user.id,
      body.label || 'Drive (conta de serviço)',
      body.folderId || undefined,
    );
    return { id: conn.id, label: conn.label, accountEmail: conn.accountEmail };
  }

  // ─── OAuth Google ───────────────────────────────────────────

  @Get('google/authorize')
  googleAuth(@Req() req: any) {
    const state = Buffer.from(JSON.stringify({ userId: req.user.id, label: req.query.label || 'Drive Escritorio', rootFolderId: req.query.rootFolderId || null })).toString('base64url');
    return { url: this.google.generateAuthUrl(state) };
  }

  @Public()
  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      await this.google.exchangeCode(code, decoded.userId, decoded.label, decoded.rootFolderId ?? undefined);
      const frontend = process.env.FRONTEND_BASE_URL || 'https://frontend-production-2825.up.railway.app';
      return res.redirect(`${frontend}/drive-conectado?connected=google`);
    } catch (err: any) {
      const frontend = process.env.FRONTEND_BASE_URL || 'https://frontend-production-2825.up.railway.app';
      return res.redirect(`${frontend}/drive-conectado?error=${encodeURIComponent(err?.message ?? 'erro')}`);
    }
  }

  // ─── OAuth Microsoft ────────────────────────────────────────

  @Get('microsoft/authorize')
  async microsoftAuth(@Req() req: any) {
    const state = Buffer.from(JSON.stringify({ userId: req.user.id, label: req.query.label || 'OneDrive Escritorio', rootFolderId: req.query.rootFolderId || null })).toString('base64url');
    const url = await this.onedrive.generateAuthUrl(state);
    return { url };
  }

  @Public()
  @Get('microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      await this.onedrive.exchangeCode(code, decoded.userId, decoded.label, decoded.rootFolderId ?? undefined);
      const frontend = process.env.FRONTEND_BASE_URL || 'https://frontend-production-2825.up.railway.app';
      return res.redirect(`${frontend}/drive-conectado?connected=microsoft`);
    } catch (err: any) {
      const frontend = process.env.FRONTEND_BASE_URL || 'https://frontend-production-2825.up.railway.app';
      return res.redirect(`${frontend}/drive-conectado?error=${encodeURIComponent(err?.message ?? 'erro')}`);
    }
  }

  // ─── Busca + Analise IA ─────────────────────────────────────

  @Post('search')
  searchDocs(@Req() req: any, @Body() body: { query: string; companyId?: string }) {
    return this.search.search(body.query, req.user.id, body.companyId);
  }

  @Post('analyze')
  analyze(
    @Req() req: any,
    @Body() body: { files: Array<{ connectionId: string; fileId: string; name: string }>; instruction: string; companyId?: string },
  ) {
    return this.search.analyzeFiles(body.files, body.instruction, req.user.id, body.companyId);
  }

  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    const r = await this.prisma.generatedReport.findUnique({ where: { id } });
    if (!r) return { error: 'nao encontrado' };
    return { ...r, content: JSON.parse(r.contentJson) };
  }

  @Get('history')
  history(@Req() req: any) {
    return this.prisma.documentQuery.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
}
