import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class XmlCaptureService {
  constructor(private prisma: PrismaService) {}

  async processarXml(companyId: string, xmlContent: string, fonte: string, fileName?: string) {
    const hash = crypto.createHash('md5').update(xmlContent).digest('hex');

    // Verificar duplicata por hash
    const existing = await this.prisma.xmlCapture.findFirst({
      where: { companyId, xmlContent: { contains: hash.substring(0, 16) } },
    });

    const tipoDocumento = this.detectarTipoXml(xmlContent);
    const dados = this.extrairDadosXml(xmlContent, tipoDocumento);

    if (existing) {
      return { ...existing, duplicata: true };
    }

    const capture = await this.prisma.xmlCapture.create({
      data: {
        companyId,
        fonte,
        tipoDocumento,
        status: 'capturado',
        chaveAcesso: dados.chave,
        cnpjEmitente: dados.cnpjEmitente,
        nomeEmitente: fileName || dados.cnpjEmitente,
        dataEmissao: dados.dataEmissao,
        valorTotal: dados.valorTotal,
        xmlContent,
        validacaoStatus: 'ok',
        emailOrigem: fonte === 'email' ? fileName : undefined,
      },
    });

    return capture;
  }

  async listarCaptures(companyId: string, tipoDocumento?: string) {
    return this.prisma.xmlCapture.findMany({
      where: { companyId, ...(tipoDocumento && { tipoDocumento }) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fonte: true, tipoDocumento: true, status: true,
        chaveAcesso: true, cnpjEmitente: true, nomeEmitente: true,
        dataEmissao: true, valorTotal: true, createdAt: true,
      },
    });
  }

  async manifestarNfe(chaveAcesso: string, tipoManifestacao: string, companyId: string) {
    const capture = await this.prisma.xmlCapture.findFirst({
      where: { chaveAcesso, companyId },
    });

    const statusMap: Record<string, string> = {
      '210200': 'ciencia',
      '210210': 'confirmacao',
      '210220': 'desconhecimento',
      '210240': 'nao_realizada',
    };

    if (capture) {
      await this.prisma.xmlCapture.update({
        where: { id: capture.id },
        data: {
          manifestacao: statusMap[tipoManifestacao] || tipoManifestacao,
          manifestadaEm: new Date(),
          status: 'validado',
        },
      });
    }

    return {
      chaveAcesso,
      tipoManifestacao,
      status: statusMap[tipoManifestacao] || tipoManifestacao,
      dhRegistro: new Date().toISOString(),
    };
  }

  async consultarNfeSefaz(chave: string, _companyId: string) {
    // Em produção: WebService SEFAZ NFeConsultaProtocolo
    return {
      chave,
      status: 'Autorizado o uso da NF-e',
      codigo: '100',
      dataAutorizacao: new Date(),
      protocolo: `3${Date.now()}`,
    };
  }

  private detectarTipoXml(xml: string): string {
    if (xml.includes('<nfeProc') || xml.includes('<NFe ') || xml.includes('<NFe>')) return 'nfe';
    if (xml.includes('<CompNfse') || xml.includes('<nfseData')) return 'nfse';
    if (xml.includes('<CTe') || xml.includes('<cteProc')) return 'cte';
    if (xml.includes('<MDFe') || xml.includes('<mdfeProc')) return 'mdfe';
    return 'outro';
  }

  private extrairDadosXml(xml: string, _tipo: string) {
    const tag = (name: string) => {
      const m = xml.match(new RegExp(`<${name}[^>]*>([^<]+)</${name}>`));
      return m ? m[1].trim() : undefined;
    };
    return {
      chave: tag('chNFe') || tag('chCTe'),
      cnpjEmitente: tag('CNPJ'),
      dataEmissao: tag('dhEmi') ? new Date(tag('dhEmi')!) : undefined,
      valorTotal: tag('vNF') ? Number(tag('vNF')) : tag('vCT') ? Number(tag('vCT')) : undefined,
      numero: tag('nNF') || tag('nCT'),
      serie: tag('serie'),
    };
  }
}
