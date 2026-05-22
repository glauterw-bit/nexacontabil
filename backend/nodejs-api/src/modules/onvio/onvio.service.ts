import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from '../cloud/crypto.util';

/**
 * Integração com a Plataforma Onvio (Thomson Reuters).
 *
 * URLs e scopes são totalmente configuráveis via env porque a TR ainda
 * não publicou docs estáveis das URLs no domínio público — quando o
 * Sandro recebe client_id/secret eles também mandam as URLs corretas
 * que vão direto pras env vars no Railway.
 *
 * Env vars esperadas:
 *   ONVIO_CLIENT_ID
 *   ONVIO_CLIENT_SECRET
 *   ONVIO_AUTHORIZE_URL    (default abaixo, ajustar quando TR confirmar)
 *   ONVIO_TOKEN_URL
 *   ONVIO_API_BASE_URL
 *   ONVIO_REDIRECT_URI     (default deriva de BACKEND_BASE_URL)
 *   ONVIO_SCOPES           (default: "connect.read cargas.read")
 */
@Injectable()
export class OnvioService {
  private readonly logger = new Logger(OnvioService.name);

  constructor(private readonly prisma: PrismaService) {}

  private cfg() {
    const clientId = process.env.ONVIO_CLIENT_ID;
    const clientSecret = process.env.ONVIO_CLIENT_SECRET;
    const authorizeUrl = process.env.ONVIO_AUTHORIZE_URL || 'https://onvio.com.br/oauth/authorize';
    const tokenUrl = process.env.ONVIO_TOKEN_URL || 'https://onvio.com.br/oauth/token';
    const apiBaseUrl = process.env.ONVIO_API_BASE_URL || 'https://api.onvio.com.br';
    const backendBase = process.env.BACKEND_BASE_URL || 'https://backend-production-9eeec.up.railway.app';
    const redirectUri = process.env.ONVIO_REDIRECT_URI || `${backendBase}/api/v1/onvio/callback`;
    const scopes = process.env.ONVIO_SCOPES || 'connect.read cargas.read';
    return { clientId, clientSecret, authorizeUrl, tokenUrl, apiBaseUrl, redirectUri, scopes };
  }

  private requireCredentials() {
    const c = this.cfg();
    if (!c.clientId || !c.clientSecret) {
      throw new BadRequestException(
        'Onvio não configurado. Defina ONVIO_CLIENT_ID e ONVIO_CLIENT_SECRET no Railway. ' +
        'Solicite credenciais à Thomson Reuters via Portal Onvio.',
      );
    }
    return c;
  }

  generateAuthUrl(userId: string, returnTo?: string): string {
    const c = this.requireCredentials();
    const state = Buffer.from(JSON.stringify({
      userId,
      returnTo: returnTo ?? '/onvio',
      nonce: Math.random().toString(36).slice(2),
    })).toString('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId!,
      redirect_uri: c.redirectUri,
      scope: c.scopes,
      state,
    });
    return `${c.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string, state: string): Promise<{ userId: string; returnTo: string }> {
    const c = this.requireCredentials();
    let decoded: { userId: string; returnTo?: string; nonce?: string };
    try {
      decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('state OAuth inválido');
    }
    if (!decoded.userId) throw new BadRequestException('state sem userId');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.redirectUri,
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
    });

    const res = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Onvio token exchange failed: HTTP ${res.status} ${errText}`);
      throw new BadRequestException(`Onvio token exchange failed: HTTP ${res.status}`);
    }
    const tokens: any = await res.json();
    if (!tokens.access_token) throw new BadRequestException('Onvio retornou sem access_token');

    const expiresIn = Number(tokens.expires_in || 3600);
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const scopes = String(tokens.scope || c.scopes);

    let onvioEmail: string | null = null;
    let onvioTenantId: string | null = null;
    try {
      const userInfo = await this.fetchUserInfo(tokens.access_token);
      onvioEmail = userInfo?.email ?? null;
      onvioTenantId = userInfo?.tenantId ?? userInfo?.tenant_id ?? null;
    } catch (err: any) {
      this.logger.warn(`Não foi possível obter userinfo Onvio: ${err.message}`);
    }

    await this.prisma.onvioConnection.upsert({
      where: { userId: decoded.userId },
      create: {
        userId: decoded.userId,
        onvioEmail,
        onvioTenantId,
        encryptedAccessToken: encryptToken(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        scopes,
        modulos: null,
        active: true,
      },
      update: {
        onvioEmail,
        onvioTenantId,
        encryptedAccessToken: encryptToken(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        scopes,
        active: true,
      },
    });

    return { userId: decoded.userId, returnTo: decoded.returnTo ?? '/onvio' };
  }

  /** Renova access_token via refresh_token. Idempotente. */
  async refreshIfNeeded(userId: string): Promise<string> {
    const c = this.requireCredentials();
    const conn = await this.prisma.onvioConnection.findUnique({ where: { userId } });
    if (!conn || !conn.active) throw new NotFoundException('Conexão Onvio não encontrada');

    // ainda válido (5 min de folga)
    if (conn.tokenExpiresAt.getTime() > Date.now() + 5 * 60_000) {
      return decryptToken(conn.encryptedAccessToken);
    }
    if (!conn.encryptedRefreshToken) {
      throw new BadRequestException('Token Onvio expirado e sem refresh_token — reconectar.');
    }

    const refreshToken = decryptToken(conn.encryptedRefreshToken);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: c.clientId!,
      client_secret: c.clientSecret!,
    });
    const res = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new BadRequestException(`Refresh Onvio falhou: HTTP ${res.status} ${errText}`);
    }
    const tokens: any = await res.json();
    const expiresIn = Number(tokens.expires_in || 3600);

    await this.prisma.onvioConnection.update({
      where: { userId },
      data: {
        encryptedAccessToken: encryptToken(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : conn.encryptedRefreshToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });
    return tokens.access_token;
  }

  /** Endpoint do user atual (varia por escritório TR — tentamos várias rotas). */
  private async fetchUserInfo(accessToken: string): Promise<any> {
    const c = this.cfg();
    const candidates = [
      `${c.apiBaseUrl}/oauth/userinfo`,
      `${c.apiBaseUrl}/v1/me`,
      `${c.apiBaseUrl}/me`,
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
        if (r.ok) return await r.json();
      } catch {/* tenta próximo */}
    }
    return null;
  }

  async getStatus(userId: string) {
    const conn = await this.prisma.onvioConnection.findUnique({ where: { userId } });
    if (!conn) return { connected: false };
    return {
      connected: conn.active,
      onvioEmail: conn.onvioEmail,
      onvioTenantId: conn.onvioTenantId,
      scopes: conn.scopes,
      modulos: conn.modulos,
      expiresAt: conn.tokenExpiresAt,
      lastSyncAt: conn.lastSyncAt,
      lastSyncStatus: conn.lastSyncStatus,
      lastSyncError: conn.lastSyncError,
      syncStats: conn.syncStats ? safeJSON(conn.syncStats) : null,
    };
  }

  async disconnect(userId: string) {
    await this.prisma.onvioConnection.update({
      where: { userId },
      data: { active: false },
    });
    return { disconnected: true };
  }

  // ─── Sync (esqueleto — endpoints específicos chegam quando docs TR vierem) ─

  /**
   * Onvio envia NF: POST de uma NF emitida no NexaContabil pro Onvio →
   * Domínio (desktop) importa via Cargas. Feature "Nota fiscal e Baixa
   * de parcelas - Envio e consulta".
   */
  async enviarNotaFiscal(userId: string, fiscalNoteId: string): Promise<any> {
    const accessToken = await this.refreshIfNeeded(userId);
    const c = this.cfg();
    const note: any = await (this.prisma as any).fiscalNote.findUnique({ where: { id: fiscalNoteId } });
    if (!note) throw new NotFoundException('NF não encontrada');

    const payload = {
      tipo: note.type,                              // nfe | nfse | cte
      numero: note.number,
      chaveAcesso: note.accessKey,
      serie: note.series,
      dataEmissao: note.issueDate,
      valorTotal: note.totalValue,
      destinatario: {
        nome: note.recipientName,
        documento: note.recipientCnpjCpf,
      },
      xml: note.xmlContent,
      // Domínio espera o XML como base — o resto é metadado pra fast-match.
    };

    const url = `${c.apiBaseUrl}/v1/notas-fiscais`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      await this.recordSync(userId, 'error', { ultimoEnvio: fiscalNoteId }, `HTTP ${r.status} ${errText.slice(0, 200)}`);
      throw new BadRequestException(`Onvio NF envio: HTTP ${r.status}`);
    }
    const resp = await r.json();
    await this.recordSync(userId, 'ok', { ultimoEnvio: fiscalNoteId, ultimoTipo: 'nf' }, null);
    return resp;
  }

  async consultarNotasFiscais(userId: string, params?: { cnpj?: string; periodo?: string }): Promise<any> {
    const accessToken = await this.refreshIfNeeded(userId);
    const c = this.cfg();
    const qs = new URLSearchParams();
    if (params?.cnpj) qs.set('cnpj', params.cnpj);
    if (params?.periodo) qs.set('periodo', params.periodo);
    const url = `${c.apiBaseUrl}/v1/notas-fiscais${qs.toString() ? `?${qs.toString()}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!r.ok) throw new BadRequestException(`Onvio NF consulta: HTTP ${r.status}`);
    return r.json();
  }

  /**
   * Envia baixa de parcela ao Onvio → Domínio atualiza Contas a Receber.
   * Feature "Baixa de parcelas - Envio e consulta".
   */
  async enviarBaixaParcela(userId: string, boletoId: string): Promise<any> {
    const accessToken = await this.refreshIfNeeded(userId);
    const c = this.cfg();
    const boleto: any = await (this.prisma as any).boleto.findUnique({ where: { id: boletoId } });
    if (!boleto) throw new NotFoundException('Boleto não encontrado');
    if (!boleto.paidAt) throw new BadRequestException('Boleto ainda não foi pago — não há baixa a enviar');

    const payload = {
      identificador: boleto.id,
      cnpj: boleto.companyCnpj ?? null,
      valorPago: boleto.paidAmount ?? boleto.amount,
      dataPagamento: boleto.paidAt,
      linhaDigitavel: boleto.linhaDigitavel ?? null,
      observacao: boleto.description ?? null,
    };

    const url = `${c.apiBaseUrl}/v1/baixas-parcelas`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      await this.recordSync(userId, 'error', { ultimoEnvio: boletoId }, `HTTP ${r.status} ${errText.slice(0, 200)}`);
      throw new BadRequestException(`Onvio Baixa envio: HTTP ${r.status}`);
    }
    const resp = await r.json();
    await this.recordSync(userId, 'ok', { ultimoEnvio: boletoId, ultimoTipo: 'baixa' }, null);
    return resp;
  }

  /**
   * Envia lançamento de rubrica (proventos/descontos de folha) ao Onvio →
   * Domínio Folha importa. Feature "Lançamentos de Rubricas - Envio".
   */
  async enviarRubricaFolha(userId: string, payslipId: string): Promise<any> {
    const accessToken = await this.refreshIfNeeded(userId);
    const c = this.cfg();
    const payslip: any = await (this.prisma as any).payslip.findUnique({
      where: { id: payslipId },
      include: { employee: true },
    });
    if (!payslip) throw new NotFoundException('Holerite não encontrado');

    // Monta rubricas a partir do breakdown / campos canonicos
    const rubricas: any[] = [];
    const breakdown = safeJSON(payslip.breakdown) ?? {};

    rubricas.push({ codigo: '0001', descricao: 'Salário Base',  tipo: 'P', valor: payslip.baseSalary });
    if (payslip.overtimeValue) rubricas.push({ codigo: '0050', descricao: 'Horas Extras', tipo: 'P', valor: payslip.overtimeValue, horas: payslip.overtimeHours });
    if (payslip.bonuses)       rubricas.push({ codigo: '0080', descricao: 'Bonificações', tipo: 'P', valor: payslip.bonuses });
    if (payslip.inssEmployee)  rubricas.push({ codigo: '9001', descricao: 'INSS',         tipo: 'D', valor: payslip.inssEmployee });
    if (payslip.irrf)          rubricas.push({ codigo: '9010', descricao: 'IRRF',         tipo: 'D', valor: payslip.irrf });
    if (payslip.otherDeductions) rubricas.push({ codigo: '9099', descricao: 'Outros Descontos', tipo: 'D', valor: payslip.otherDeductions });

    const payload = {
      identificador: payslip.id,
      colaborador: {
        cpf: payslip.employee?.cpf,
        nome: payslip.employee?.name,
        pis: payslip.employee?.pis,
      },
      competencia: payslip.referenceMonth,
      rubricas,
      totais: {
        bruto: payslip.grossSalary,
        liquido: payslip.netSalary,
        inssPatronal: payslip.inssEmployer,
        fgts: payslip.fgts,
      },
      breakdown,
    };

    const url = `${c.apiBaseUrl}/v1/rubricas`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      await this.recordSync(userId, 'error', { ultimoEnvio: payslipId }, `HTTP ${r.status} ${errText.slice(0, 200)}`);
      throw new BadRequestException(`Onvio Rubrica envio: HTTP ${r.status}`);
    }
    const resp = await r.json();
    await this.recordSync(userId, 'ok', { ultimoEnvio: payslipId, ultimoTipo: 'rubrica' }, null);
    return resp;
  }

  private async recordSync(userId: string, status: string, stats: any, error: string | null) {
    await this.prisma.onvioConnection.update({
      where: { userId },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: error,
        syncStats: JSON.stringify(stats),
      },
    });
  }
}

function mapRegime(v: any): string {
  const s = String(v ?? '').toUpperCase();
  if (s.includes('SIMPLES')) return 'SIMPLES_NACIONAL';
  if (s.includes('PRESUMIDO')) return 'LUCRO_PRESUMIDO';
  if (s.includes('REAL')) return 'LUCRO_REAL';
  if (s.includes('MEI')) return 'MEI';
  return 'SIMPLES_NACIONAL';
}

function safeJSON(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
