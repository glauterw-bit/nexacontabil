import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export interface Signer {
  name: string;
  email: string;
  role?: string;
  token?: string;
  signedAt?: string;
}

export interface CreateSignatureRequestDto {
  companyId: string;
  title: string;
  documentUrl: string;
  signers: Omit<Signer, 'token' | 'signedAt'>[];
  expiresInDays?: number;
}

interface AuditEntry {
  action: string;
  signerEmail?: string;
  token?: string;
  timestamp: string;
  ipHash?: string;
}

@Injectable()
export class SignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gera um token único de assinatura para cada signatário */
  private _generateToken(email: string, requestId: string): string {
    const raw = `${email}:${requestId}:${randomBytes(16).toString('hex')}`;
    return createHash('sha256').update(raw).digest('hex').substring(0, 32);
  }

  /** Gera uma "URL" de documento assinado (stub) */
  private _generateSignedDocUrl(requestId: string): string {
    const hash = createHash('sha256')
      .update(`signed:${requestId}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
    return `https://docs.nexacontabil.internal/signed/${requestId}/${hash}.pdf`;
  }

  async createRequest(dto: CreateSignatureRequestDto) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (dto.expiresInDays ?? 7));

    // Cria o registro para obter o ID antes de gerar os tokens
    const request = await this.prisma.signatureRequest.create({
      data: {
        companyId: dto.companyId,
        title: dto.title,
        documentUrl: dto.documentUrl,
        signers: JSON.stringify([]), // temporário
        expiresAt,
        status: 'pending',
        auditLog: JSON.stringify([
          {
            action: 'request_created',
            timestamp: new Date().toISOString(),
          } as AuditEntry,
        ]),
      },
    });

    // Gera tokens para cada signatário
    const signersWithTokens: Signer[] = dto.signers.map(signer => ({
      ...signer,
      token: this._generateToken(signer.email, request.id),
      signedAt: undefined,
    }));

    // Atualiza com os signatários e tokens
    return this.prisma.signatureRequest.update({
      where: { id: request.id },
      data: { signers: JSON.stringify(signersWithTokens) },
    });
  }

  async findAll(companyId: string, status?: string) {
    return this.prisma.signatureRequest.findMany({
      where: {
        companyId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const req = await this.prisma.signatureRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`Solicitação de assinatura ${id} não encontrada`);
    return req;
  }

  /**
   * Assina o documento com o token do signatário.
   * Verifica se o token é válido e, quando todos assinam, marca como completo.
   */
  async sign(requestId: string, token: string) {
    const request = await this.findById(requestId);

    if (request.status === 'completed') {
      throw new BadRequestException('Documento já foi completamente assinado');
    }
    if (request.status === 'expired' || new Date() > request.expiresAt) {
      await this.prisma.signatureRequest.update({
        where: { id: requestId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Solicitação de assinatura expirada');
    }

    const signers: Signer[] = JSON.parse(request.signers as string);
    const signerIndex = signers.findIndex(s => s.token === token);

    if (signerIndex === -1) {
      throw new BadRequestException('Token de assinatura inválido');
    }
    if (signers[signerIndex].signedAt) {
      throw new BadRequestException('Este signatário já assinou o documento');
    }

    // Registra a assinatura
    signers[signerIndex].signedAt = new Date().toISOString();

    // Adiciona entrada no audit log
    const auditLog: AuditEntry[] = JSON.parse(request.auditLog as string);
    auditLog.push({
      action: 'document_signed',
      signerEmail: signers[signerIndex].email,
      token: token.substring(0, 8) + '...', // não logar token completo
      timestamp: new Date().toISOString(),
    });

    // Verifica se todos assinaram
    const allSigned = signers.every(s => !!s.signedAt);
    const now = new Date();

    if (allSigned) {
      auditLog.push({
        action: 'all_signed_completed',
        timestamp: now.toISOString(),
      });
    }

    return this.prisma.signatureRequest.update({
      where: { id: requestId },
      data: {
        signers: JSON.stringify(signers),
        auditLog: JSON.stringify(auditLog),
        ...(allSigned && {
          status: 'completed',
          completedAt: now,
          signedDocUrl: this._generateSignedDocUrl(requestId),
        }),
      },
    });
  }

  async cancelRequest(id: string) {
    const request = await this.findById(id);
    if (request.status === 'completed') {
      throw new BadRequestException('Não é possível cancelar uma solicitação já completada');
    }

    const auditLog: AuditEntry[] = JSON.parse(request.auditLog as string);
    auditLog.push({ action: 'request_cancelled', timestamp: new Date().toISOString() });

    return this.prisma.signatureRequest.update({
      where: { id },
      data: { status: 'cancelled', auditLog: JSON.stringify(auditLog) },
    });
  }
}
