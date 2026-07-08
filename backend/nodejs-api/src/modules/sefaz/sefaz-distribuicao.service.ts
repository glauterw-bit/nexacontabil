import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as zlib from 'zlib';
import { PrismaService } from '../../database/prisma.service';
import { CertificadoDigitalService } from '../certificado-digital/certificado-digital.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';

/**
 * BUSCADOR NATIVO NO SEFAZ — NFeDistribuiçãoDFe (ambiente nacional / SVRS).
 *
 * É o serviço oficial que ENTREGA ao destinatário todas as NF-e emitidas contra o
 * CNPJ dele. Consulta incremental por NSU (Número Sequencial Único): a gente pede
 * "tudo a partir do último NSU que li", o SEFAZ devolve um lote compactado, guardamos
 * o novo NSU e continuamos. Sem terceiros — só o certificado A1 do cliente (ou do
 * escritório com procuração e-CAC) via mTLS.
 *
 * Reaproveita: certificado (mTLS) + pipeline de ingestão (parseNfe + validação + Document).
 * Limite de consumo do SEFAZ: ao zerar a fila (ultNSU == maxNSU), só voltar a consultar
 * após ~1h — senão retorna cStat 656 (consumo indevido).
 */
@Injectable()
export class SefazDistribuicaoService {
  private readonly logger = new Logger('SEFAZ-DFe');
  // Ambiente Nacional (hospedado no SVRS) — atende a distribuição de NF-e de todas as UFs.
  private readonly url = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
  private readonly tpAmb = process.env.SEFAZ_AMBIENTE === '2' ? 2 : 1; // 1=produção
  private readonly PAUSA_MS = 1200;

  // UF → código IBGE (cUFAutor exigido no distDFeInt)
  private readonly UF: Record<string, string> = {
    AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32',
    GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41',
    PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42',
    SP: '35', SE: '28', TO: '17',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificados: CertificadoDigitalService,
    private readonly analise: AnaliseClienteService,
  ) {}

  private pausa(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

  private get1(re: RegExp, xml: string): string | undefined {
    const m = xml.match(re);
    return m ? m[1] : undefined;
  }

  /** Monta o envelope SOAP 1.2 do nfeDistDFeInteresse. */
  private envelope(cUF: string, cnpj: string, ultNSU: string): string {
    const nsu = ultNSU.padStart(15, '0');
    return `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body>` +
      `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
      `<nfeDadosMsg>` +
      `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.35">` +
      `<tpAmb>${this.tpAmb}</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ>` +
      `<distNSU><ultNSU>${nsu}</ultNSU></distNSU>` +
      `</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>` +
      `</soap12:Body></soap12:Envelope>`;
  }

  /** base64(gzip) → XML string. */
  private descompactar(b64: string): string | null {
    try {
      const buf = Buffer.from(b64.trim(), 'base64');
      if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf).toString('utf8');
      return buf.toString('utf8');
    } catch { return null; }
  }

  /** Status/config da integração (sem certificado não busca). */
  async status(companyId?: string) {
    const base = {
      provider: 'sefaz-distribuicao-dfe',
      ambiente: this.tpAmb === 1 ? 'produção' : 'homologação',
      servico: 'NFeDistribuiçãoDFe (nacional)',
      cobre: ['NF-e (destinatário)'],
      requer: 'Certificado A1 do cliente (ou do escritório + procuração e-CAC) e CNPJ real',
    };
    if (!companyId) return base;
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { cnpj: true, uf: true, sefazUltNSU: true, sefazMaxNSU: true, sefazUltConsultaEm: true },
    });
    let temCert = false;
    try { await this.certificados.getCertificadoAtivo(companyId); temCert = true; } catch { /* sem cert */ }
    const cnpj = (company?.cnpj ?? '').replace(/\D/g, '');
    return {
      ...base,
      companyId,
      certificadoAtivo: temCert,
      cnpjReal: !!cnpj && !cnpj.startsWith('7'),
      ufDefinida: !!company?.uf,
      ultNSU: company?.sefazUltNSU ?? '0',
      maxNSU: company?.sefazMaxNSU ?? null,
      ultimaConsulta: company?.sefazUltConsultaEm ?? null,
      pronto: temCert && !!cnpj && !cnpj.startsWith('7') && !!company?.uf,
    };
  }

  /**
   * Busca as NF-e do cliente no SEFAZ desde o último NSU e ingere no pipeline.
   * @param maxIteracoes teto de lotes por chamada (cada lote ~ até 50 docs).
   */
  async buscarCliente(companyId: string, senha?: string, maxIteracoes = 20) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, cnpj: true, uf: true, sefazUltNSU: true },
    });
    if (!company) throw new BadRequestException('Cliente não encontrado.');
    const cnpj = (company.cnpj ?? '').replace(/\D/g, '');
    if (!cnpj || cnpj.startsWith('7')) throw new BadRequestException('Cliente sem CNPJ real (provisório começa com 7).');
    const cUF = company.uf ? this.UF[company.uf.toUpperCase()] : undefined;
    if (!cUF) throw new BadRequestException('Defina a UF do cliente (cUFAutor é exigido pelo SEFAZ).');

    // mTLS com o certificado do cliente
    let httpsAgent: import('https').Agent;
    try {
      httpsAgent = await this.certificados.getHttpsAgent(companyId, senha);
    } catch (e: any) {
      throw new BadRequestException(`Certificado indisponível: ${e?.message ?? 'carregue o A1 do cliente'}`);
    }

    let ultNSU = company.sefazUltNSU ?? '0';
    let maxNSU = ultNSU;
    let novos = 0, duplicados = 0, invalidos = 0, docs = 0, cStatFinal = '';
    let motivo = '';

    for (let i = 0; i < maxIteracoes; i++) {
      const soap = this.envelope(cUF, cnpj, ultNSU);
      let resp: string;
      try {
        const r = await axios.post(this.url, soap, {
          httpsAgent,
          timeout: 60000,
          headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
          // o SOAP-Fault vem com HTTP 500; deixamos passar pra ler a mensagem
          validateStatus: () => true,
          responseType: 'text',
          transformResponse: [(d) => d],
        });
        resp = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      } catch (e: any) {
        throw new BadRequestException(`Falha ao falar com o SEFAZ: ${e?.message ?? e}`);
      }

      const cStat = this.get1(/<cStat>(\d+)<\/cStat>/, resp) ?? '';
      motivo = this.get1(/<xMotivo>([^<]*)<\/xMotivo>/, resp) ?? '';
      cStatFinal = cStat;
      const respUlt = this.get1(/<ultNSU>(\d+)<\/ultNSU>/, resp);
      const respMax = this.get1(/<maxNSU>(\d+)<\/maxNSU>/, resp);
      if (respMax) maxNSU = respMax;

      if (cStat === '656') { // consumo indevido — respeitar o intervalo
        motivo = 'Consumo indevido — aguarde ~1h para nova consulta (limite do SEFAZ).';
        break;
      }
      if (cStat && !['137', '138'].includes(cStat)) {
        // 137 = nenhum doc · 138 = documentos localizados · outros = erro (cert, CNPJ sem credenciamento, etc)
        throw new BadRequestException(`SEFAZ recusou (cStat ${cStat}): ${motivo}`);
      }

      // extrai cada docZip (base64+gzip) e ingere
      const zips = resp.match(/<(?:\w+:)?docZip[^>]*>([\s\S]*?)<\/(?:\w+:)?docZip>/g) ?? [];
      for (const bloco of zips) {
        const b64 = this.get1(/>([\s\S]*?)</, bloco);
        if (!b64) continue;
        const xml = this.descompactar(b64);
        if (!xml) { invalidos++; continue; }
        docs++;
        // só documentos completos viram Document (resumos "resNFe" não têm itens → ignorados)
        const r = await this.analise.ingerirXml(companyId, xml, 'sefaz');
        if (r.status === 'novo') novos++;
        else if (r.status === 'duplicado') duplicados++;
        else invalidos++;
      }

      if (respUlt) ultNSU = respUlt;
      // salva progresso a cada lote (retoma daqui se cair)
      await this.prisma.company.update({
        where: { id: companyId },
        data: { sefazUltNSU: ultNSU, sefazMaxNSU: maxNSU, sefazUltConsultaEm: new Date() },
      }).catch(() => undefined);

      if (novos > 0) {
        await this.prisma.company.update({ where: { id: companyId }, data: { sharepointAnalisadoEm: new Date() } }).catch(() => undefined);
      }

      // fim: nenhum doc, ou já chegamos ao fim da fila
      if (cStat === '137') break;
      if (respUlt && respMax && BigInt(respUlt) >= BigInt(respMax)) break;
      await this.pausa(this.PAUSA_MS);
    }

    return {
      cliente: company.name, cnpj, cUF,
      cStat: cStatFinal, motivo,
      ultNSU, maxNSU,
      docsRecebidos: docs, novos, duplicados, invalidos,
      fimDaFila: !!maxNSU && BigInt(ultNSU || '0') >= BigInt(maxNSU || '0'),
    };
  }
}
