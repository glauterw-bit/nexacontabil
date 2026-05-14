import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

/**
 * Implementacao TOTP (RFC 6238) sem dependencias externas.
 * Apps suportados: Google Authenticator, Authy, 1Password, Microsoft Authenticator.
 */
@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  // base32 alphabet (RFC 4648)
  private readonly B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  private base32Encode(buf: Buffer): string {
    let out = '';
    let bits = 0;
    let value = 0;
    for (const b of buf) {
      value = (value << 8) | b;
      bits += 8;
      while (bits >= 5) {
        out += this.B32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += this.B32[(value << (5 - bits)) & 31];
    return out;
  }

  private base32Decode(str: string): Buffer {
    const clean = str.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
      const idx = this.B32.indexOf(ch);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(out);
  }

  private generateTOTP(secret: string, counter: number): string {
    const key = this.base32Decode(secret);
    const buf = Buffer.alloc(8);
    let cnt = counter;
    for (let i = 7; i >= 0; i--) {
      buf[i] = cnt & 0xff;
      cnt = Math.floor(cnt / 256);
    }
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  }

  private currentCounter(stepSeconds = 30): number {
    return Math.floor(Date.now() / 1000 / stepSeconds);
  }

  /**
   * Inicia o enrollment: gera secret aleatorio + URL para QR code (otpauth://).
   * O secret NAO e gravado ainda — somente apos verificacao do primeiro codigo.
   */
  async start(userId: string, issuer = 'NexaContabil') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.totpEnabled) throw new BadRequestException('2FA ja esta ativo');
    const secretBuf = crypto.randomBytes(20);
    const secret = this.base32Encode(secretBuf);
    const label = encodeURIComponent(`${issuer}:${user.email}`);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    // Grava temporariamente como NAO habilitado; usuario confirma com codigo
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret, totpEnabled: false } });
    return { secret, otpauth };
  }

  async enableAfterVerify(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) throw new BadRequestException('Inicie o enrollment primeiro');
    if (!this.verifyCode(user.totpSecret, code)) throw new BadRequestException('Codigo invalido');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpVerifiedAt: new Date() },
    });
    return { enabled: true };
  }

  async disable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret || !user.totpEnabled) throw new BadRequestException('2FA nao esta ativo');
    if (!this.verifyCode(user.totpSecret, code)) throw new BadRequestException('Codigo invalido');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabled: false, totpVerifiedAt: null },
    });
    return { disabled: true };
  }

  verifyForLogin(userId: string, code: string): Promise<boolean> {
    return this.prisma.user
      .findUnique({ where: { id: userId } })
      .then((user) => {
        if (!user || !user.totpEnabled || !user.totpSecret) return false;
        return this.verifyCode(user.totpSecret, code);
      });
  }

  /** Aceita drift de +/- 1 janela (90s total). */
  private verifyCode(secret: string, code: string): boolean {
    const counter = this.currentCounter();
    for (const drift of [-1, 0, 1]) {
      if (this.generateTOTP(secret, counter + drift) === code) return true;
    }
    return false;
  }
}
