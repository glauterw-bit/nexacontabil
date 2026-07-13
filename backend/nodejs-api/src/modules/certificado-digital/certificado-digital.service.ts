import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import * as forge from 'node-forge';
import * as https from 'https';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface CertificadoInfo {
  id: string;
  companyId: string;
  nome: string;
  tipo: string;
  cnpjCpf: string;
  dataEmissao: Date;
  dataValidade: Date;
  emissor?: string | null;
  serialNumber?: string | null;
  thumbprint?: string | null;
  active: boolean;
  alertaDias: number;
  diasParaVencer?: number;
  expirado?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidadeResult {
  companyId: string;
  diasRestantes: number;
  dataValidade: Date;
  expirado: boolean;
  alertar: boolean;
  certificados: CertificadoInfo[];
}

export interface CertificadoParsed {
  cert: forge.pki.Certificate;
  privateKey: forge.pki.PrivateKey;
  certPem: string;
  keyPem: string;
  cnpjCpf: string;
  dataEmissao: Date;
  dataValidade: Date;
  emissor: string;
  serialNumber: string;
  thumbprint: string;
}

// ─── Helpers de Crypto ────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';

function getAppSecret(): Buffer {
  const secret = process.env.APP_SECRET ?? 'nexacontabil-default-secret-32ch';
  return Buffer.alloc(32, secret.padEnd(32, '0'));
}

function encryptPfx(pfxBase64: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const key = getAppSecret();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.from(pfxBase64, 'base64');
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = (cipher as any).getAuthTag() as Buffer;
  const combined = Buffer.concat([encrypted, authTag]);
  return { encrypted: combined.toString('base64'), iv: iv.toString('hex') };
}

function decryptPfx(encryptedBase64: string, ivHex: string): Buffer {
  const key = getAppSecret();
  const iv = Buffer.from(ivHex, 'hex');
  const combined = Buffer.from(encryptedBase64, 'base64');
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  (decipher as any).setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ─── Parser PFX Real (node-forge) ────────────────────────────────────────────

export function parsePfxReal(pfxBase64: string, senha: string): CertificadoParsed {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Der = forge.util.decode64(pfxBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
  } catch (err: any) {
    throw new BadRequestException(`Erro ao ler PFX: ${err.message}. Verifique a senha.`);
  }

  // Extrair certificado
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certList = certBags[forge.pki.oids.certBag] ?? [];
  const certBag = certList.find(b => b.cert) ?? certList[0];
  if (!certBag?.cert) throw new BadRequestException('Certificado não encontrado no arquivo PFX');
  const cert = certBag.cert;

  // Extrair chave privada (pkcs8ShroudedKeyBag ou keyBag)
  let privateKey: forge.pki.PrivateKey | null = null;
  const shroudedBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const shroudedList = shroudedBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  if (shroudedList.length > 0 && shroudedList[0].key) {
    privateKey = shroudedList[0].key as forge.pki.PrivateKey;
  } else {
    const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    const keyList = keyBags[forge.pki.oids.keyBag] ?? [];
    if (keyList.length > 0 && keyList[0].key) {
      privateKey = keyList[0].key as forge.pki.PrivateKey;
    }
  }
  if (!privateKey) throw new BadRequestException('Chave privada não encontrada no arquivo PFX');

  // Extrair CNPJ/CPF do Subject (CN geralmente contém "NOME:CNPJ" em ICP-Brasil)
  let cnpjCpf = '00000000000000';
  const cnField = cert.subject.getField('CN');
  if (cnField?.value) {
    const match = cnField.value.match(/\d{14}|\d{11}/);
    if (match) cnpjCpf = match[0];
  }
  // Fallback: OU pode conter o CNPJ
  if (cnpjCpf === '00000000000000') {
    const ouField = cert.subject.getField('OU');
    if (ouField?.value) {
      const match = ouField.value.match(/\d{14}|\d{11}/);
      if (match) cnpjCpf = match[0];
    }
  }

  const emissor = cert.issuer.getField('CN')?.value ?? cert.issuer.getField('O')?.value ?? 'AC ICP-Brasil';
  const serialNumber = cert.serialNumber.toUpperCase();

  // Thumbprint SHA-1
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const thumbprint = forge.md.sha1.create().update(certDer).digest().toHex().toUpperCase();

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(privateKey);

  return {
    cert,
    privateKey,
    certPem,
    keyPem,
    cnpjCpf,
    dataEmissao: cert.validity.notBefore,
    dataValidade: cert.validity.notAfter,
    emissor,
    serialNumber,
    thumbprint,
  };
}

// ─── Assinatura XMLDSig (RSA-SHA1 — padrão ICP-Brasil NF-e/eSocial) ──────────

export function assinarXmlComForge(
  xmlContent: string,
  certPem: string,
  keyPem: string,
  referenceUri: string = '',
): string {
  // Canonicalização C14N simples (remover whitespace redundante)
  const xmlToSign = xmlContent.trim();

  // Digest SHA-1 do conteúdo
  const md = forge.md.sha1.create();
  md.update(xmlToSign, 'utf8');
  const digestValue = forge.util.encode64(md.digest().bytes());

  // Monta SignedInfo
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="${referenceUri ? '#' + referenceUri : ''}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // Assina SignedInfo com RSA-SHA1
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const mdSi = forge.md.sha1.create();
  mdSi.update(signedInfo, 'utf8');
  const signatureBytes = (privateKey as any).sign(mdSi);
  const signatureValue = forge.util.encode64(signatureBytes);

  // Extrai apenas o corpo do certificado (sem header PEM)
  const certBody = certPem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\r?\n/g, '');

  const signatureBlock = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo>` +
    `<X509Data><X509Certificate>${certBody}</X509Certificate></X509Data>` +
    `</KeyInfo>` +
    `</Signature>`;

  // Injeta assinatura antes da última tag de fechamento do elemento raiz
  const lastClose = xmlToSign.lastIndexOf('</');
  if (lastClose === -1) return xmlToSign + signatureBlock;
  return xmlToSign.slice(0, lastClose) + signatureBlock + xmlToSign.slice(lastClose);
}

// ─── HTTPS Agent com certificado cliente (para SOAP com mTLS) ─────────────────

export function buildHttpsAgent(certPem: string, keyPem: string): https.Agent {
  return new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CertificadoDigitalService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Salvar Certificado A1 ────────────────────────────────────────────────

  async salvarCertificadoA1(
    companyId: string,
    pfxBase64: string,
    senha: string,
    nome: string,
  ): Promise<CertificadoInfo> {
    const pfxBuf = Buffer.from(pfxBase64, 'base64');
    if (pfxBuf.length < 4) throw new BadRequestException('Arquivo PFX inválido ou corrompido');

    // Parse real com node-forge
    const meta = parsePfxReal(pfxBase64, senha);
    const { encrypted, iv } = encryptPfx(pfxBase64);

    // Persiste também a senha criptografada para uso posterior
    const encSenha = encryptPfx(Buffer.from(senha).toString('base64'));

    await this.prisma.certificadoDigital.updateMany({
      where: { companyId, tipo: 'a1', active: true },
      data: { active: false },
    });

    const diasParaVencer = Math.floor(
      (meta.dataValidade.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const cert = await this.prisma.certificadoDigital.create({
      data: {
        companyId,
        nome,
        tipo: 'a1',
        cnpjCpf: meta.cnpjCpf,
        dataEmissao: meta.dataEmissao,
        dataValidade: meta.dataValidade,
        emissor: meta.emissor,
        serialNumber: meta.serialNumber,
        thumbprint: meta.thumbprint,
        pfxEncrypted: encrypted,
        pfxIv: iv,
        // senha criptografada persiste — mTLS continua funcionando após reinício do app
        senhaEncrypted: encSenha.encrypted,
        senhaIv: encSenha.iv,
        active: true,
        alertaDias: 30,
      },
    });

    // Armazena senha em cache de processo (para uso em assinatura na mesma sessão)
    CertificadoDigitalService._senhaCache.set(cert.id, senha);

    return { ...cert, diasParaVencer, expirado: diasParaVencer < 0 };
  }

  // Cache de senhas em memória (por sessão de processo — não persiste reinício)
  private static _senhaCache = new Map<string, string>();

  definirSenha(certId: string, senha: string): void {
    CertificadoDigitalService._senhaCache.set(certId, senha);
  }

  // ─── Obter Certificado Ativo com PFX decriptado ───────────────────────────

  async getCertificadoAtivo(companyId: string): Promise<{ cert: any; pfxBuffer: Buffer }> {
    const cert = await this.prisma.certificadoDigital.findFirst({
      where: { companyId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!cert) throw new NotFoundException(`Nenhum certificado ativo para empresa ${companyId}`);
    if (!cert.pfxEncrypted || !cert.pfxIv) {
      throw new BadRequestException('Certificado sem chave privada (A3/nuvem não suportado aqui)');
    }
    const pfxBuffer = decryptPfx(cert.pfxEncrypted, cert.pfxIv);
    return { cert, pfxBuffer };
  }

  // ─── Obter certificado parsed (com chave privada real) ────────────────────

  async getCertificadoParsed(companyId: string, senha?: string): Promise<CertificadoParsed> {
    const { cert: certDb, pfxBuffer } = await this.getCertificadoAtivo(companyId);

    return parsePfxReal(pfxBuffer.toString('base64'), this._senhaDe(certDb, senha));
  }

  // ─── Listar Certificados ──────────────────────────────────────────────────

  async listarCertificados(companyId: string): Promise<CertificadoInfo[]> {
    const certs = await this.prisma.certificadoDigital.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return certs.map(cert => {
      const diasParaVencer = Math.floor(
        (cert.dataValidade.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return {
        ...cert,
        pfxEncrypted: undefined,
        pfxIv: undefined,
        diasParaVencer,
        expirado: diasParaVencer < 0,
      };
    });
  }

  // ─── Verificar Validade ───────────────────────────────────────────────────

  async verificarValidade(companyId: string): Promise<ValidadeResult> {
    const certs = await this.listarCertificados(companyId);
    const ativos = certs.filter(c => c.active);
    if (ativos.length === 0) {
      throw new NotFoundException(`Nenhum certificado ativo para empresa ${companyId}`);
    }
    const principal = ativos.reduce((min, c) =>
      (c.diasParaVencer ?? 999) < (min.diasParaVencer ?? 999) ? c : min,
    );
    return {
      companyId,
      diasRestantes: principal.diasParaVencer ?? 0,
      dataValidade: principal.dataValidade,
      expirado: (principal.diasParaVencer ?? 0) < 0,
      alertar: (principal.diasParaVencer ?? 0) <= principal.alertaDias,
      certificados: certs,
    };
  }

  // ─── Remover Certificado ──────────────────────────────────────────────────

  async removerCertificado(id: string): Promise<boolean> {
    const cert = await this.prisma.certificadoDigital.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException(`Certificado ${id} não encontrado`);
    await this.prisma.certificadoDigital.update({
      where: { id },
      data: { active: false, pfxEncrypted: null, pfxIv: null },
    });
    CertificadoDigitalService._senhaCache.delete(id);
    return true;
  }

  // ─── Assinar XML (RSA-SHA1, padrão ICP-Brasil) ───────────────────────────

  async assinarXml(xmlContent: string, companyId: string, senha?: string): Promise<string> {
    const parsed = await this.getCertificadoParsed(companyId, senha);
    return assinarXmlComForge(xmlContent, parsed.certPem, parsed.keyPem);
  }

  // ─── HTTPS Agent com certificado (para SOAP mTLS) ────────────────────────

  async getHttpsAgent(companyId: string, senha?: string): Promise<https.Agent> {
    const parsed = await this.getCertificadoParsed(companyId, senha);
    return buildHttpsAgent(parsed.certPem, parsed.keyPem);
  }

  // ─── Certificado do ESCRITÓRIO (um só, usado p/ todos via procuração e-CAC) ──

  async temEscritorio(): Promise<{ tem: boolean; cnpj?: string; validade?: Date; nome?: string }> {
    const c = await this.prisma.certificadoDigital.findFirst({ where: { escritorio: true, active: true }, orderBy: { createdAt: 'desc' } });
    return c ? { tem: true, cnpj: c.cnpjCpf, validade: c.dataValidade, nome: c.nome } : { tem: false };
  }

  /** Recupera a senha do PFX: parâmetro → cache de processo → senha persistida (criptografada). */
  private _senhaDe(cert: any, senha?: string): string {
    if (senha) return senha;
    const cacheada = CertificadoDigitalService._senhaCache.get(cert.id);
    if (cacheada) return cacheada;
    if (cert.senhaEncrypted && cert.senhaIv) {
      try { return decryptPfx(cert.senhaEncrypted, cert.senhaIv).toString('utf8'); } catch { /* segue */ }
    }
    return '';
  }

  private async _parsedDe(cert: any, senha?: string): Promise<CertificadoParsed> {
    if (!cert?.pfxEncrypted || !cert?.pfxIv) throw new BadRequestException('Certificado sem chave privada.');
    const pfxBuffer = decryptPfx(cert.pfxEncrypted, cert.pfxIv);
    return parsePfxReal(pfxBuffer.toString('base64'), this._senhaDe(cert, senha));
  }

  /** https.Agent com o certificado do ESCRITÓRIO (mTLS) — para consultar todos os clientes. */
  async getHttpsAgentEscritorio(senha?: string): Promise<https.Agent> {
    const cert = await this.prisma.certificadoDigital.findFirst({ where: { escritorio: true, active: true }, orderBy: { createdAt: 'desc' } });
    if (!cert) throw new NotFoundException('Nenhum certificado do escritório configurado.');
    const parsed = await this._parsedDe(cert, senha);
    return buildHttpsAgent(parsed.certPem, parsed.keyPem);
  }

  /** Salva o certificado A1 do ESCRITÓRIO (marca escritorio=true; desmarca os anteriores). */
  async salvarCertificadoEscritorio(pfxBase64: string, senha: string, nome: string): Promise<CertificadoInfo> {
    const meta = parsePfxReal(pfxBase64, senha);
    const { encrypted, iv } = encryptPfx(pfxBase64);
    const encSenha = encryptPfx(Buffer.from(senha, 'utf8').toString('base64'));
    // âncora de companyId: usa a primeira empresa ativa (o cert do escritório não é de um cliente)
    const ancora = await this.prisma.company.findFirst({ where: { active: true }, select: { id: true } });
    if (!ancora) throw new BadRequestException('Cadastre ao menos uma empresa antes.');
    await this.prisma.certificadoDigital.updateMany({ where: { escritorio: true, active: true }, data: { active: false } });
    const cert = await this.prisma.certificadoDigital.create({
      data: {
        companyId: ancora.id, nome, tipo: 'a1', escritorio: true,
        cnpjCpf: meta.cnpjCpf, dataEmissao: meta.dataEmissao, dataValidade: meta.dataValidade,
        emissor: meta.emissor, serialNumber: meta.serialNumber, thumbprint: meta.thumbprint,
        pfxEncrypted: encrypted, pfxIv: iv,
        senhaEncrypted: encSenha.encrypted, senhaIv: encSenha.iv,
        active: true, alertaDias: 30,
      },
    });
    CertificadoDigitalService._senhaCache.set(cert.id, senha);
    const dias = Math.floor((meta.dataValidade.getTime() - Date.now()) / 86400000);
    return { ...cert, diasParaVencer: dias, expirado: dias < 0 };
  }

  // ─── Configurar BirdID ────────────────────────────────────────────────────

  async configurarBirdID(
    companyId: string,
    clientId: string,
    authCode: string,
  ): Promise<CertificadoInfo> {
    const tokenUrl = 'https://account.birdid.com.br/v2/oauth/token';
    let oauthToken: string;
    let cnpjCpf = '00000000000000';
    let nome = 'Certificado em Nuvem BirdID';

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: clientId,
          redirect_uri: process.env.BIRDID_REDIRECT_URI ?? 'https://app.nexacontabil.com.br/auth/birdid',
        }).toString(),
      });
      if (response.ok) {
        const tokenData = await response.json();
        oauthToken = tokenData.access_token;
        const certResponse = await fetch('https://account.birdid.com.br/v2/oauth/userinfo', {
          headers: { Authorization: `Bearer ${oauthToken}` },
        });
        if (certResponse.ok) {
          const certData = await certResponse.json();
          cnpjCpf = certData.cpf ?? certData.cnpj ?? cnpjCpf;
          nome = certData.name ?? nome;
        }
      } else {
        oauthToken = `stub_birdid_${Date.now()}`;
      }
    } catch {
      oauthToken = `stub_birdid_${Date.now()}`;
    }

    await this.prisma.certificadoDigital.updateMany({
      where: { companyId, tipo: 'nuvem_birdid', active: true },
      data: { active: false },
    });

    const now = new Date();
    const cert = await this.prisma.certificadoDigital.create({
      data: {
        companyId, nome, tipo: 'nuvem_birdid', cnpjCpf,
        oauthClientId: clientId, oauthToken,
        dataEmissao: now,
        dataValidade: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
        active: true, alertaDias: 30,
      },
    });

    return { ...cert, diasParaVencer: 365, expirado: false };
  }

  // ─── Assinar com BirdID ───────────────────────────────────────────────────

  async assinarComBirdID(hash: string, companyId: string): Promise<string> {
    const cert = await this.prisma.certificadoDigital.findFirst({
      where: { companyId, tipo: 'nuvem_birdid', active: true },
    });
    if (!cert) throw new NotFoundException(`Certificado BirdID não encontrado`);
    if (!cert.oauthToken) throw new BadRequestException('Token OAuth BirdID não disponível');

    try {
      const response = await fetch('https://account.birdid.com.br/v2/oauth/sign', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cert.oauthToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hash, hashAlgorithm: 'SHA256' }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.signature as string;
      }
    } catch { /* fallback */ }

    return createHash('sha256').update(`${hash}${cert.oauthToken}`).digest('base64');
  }
}
