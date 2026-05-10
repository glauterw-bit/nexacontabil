import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// ─── DTOs / Interfaces ────────────────────────────────────────────────────────

export interface EnderecoNFSeDto {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

export interface EmitirNFSeDto {
  companyId: string;
  tomador: {
    nome: string;
    cnpjCpf: string;
    email?: string;
    endereco?: EnderecoNFSeDto;
  };
  servico: {
    discriminacao: string;
    codigoServico: string; // LC 116
    cnaeServico?: string;
    municipioPrestacao: string;
    codigoMunicipio: string;
  };
  valores: {
    servicos: number;
    deducoes?: number;
    issRetido?: boolean;
    aliquotaIss?: number;
  };
  competencia: string; // YYYY-MM
  optanteSimplesNacional?: boolean;
}

export interface ImpostoServicoResult {
  iss: number;
  pis: number;
  cofins: number;
  inss: number;
  ir: number;
  csll: number;
  totalRetencoes: number;
  valorLiquido: number;
}

export interface MunicipioInfo {
  codigoIbge: string;
  nome: string;
  uf: string;
  aliquotaIssMinima: number;
  aliquotaIssMaxima: number;
  aliquotaIssPadrao: number;
  integradoNfeio: boolean;
}

// ─── Tabela de Municípios ─────────────────────────────────────────────────────

const MUNICIPIOS: Record<string, MunicipioInfo> = {
  '3550308': { codigoIbge: '3550308', nome: 'São Paulo', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3304557': { codigoIbge: '3304557', nome: 'Rio de Janeiro', uf: 'RJ', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '3106200': { codigoIbge: '3106200', nome: 'Belo Horizonte', uf: 'MG', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '4314902': { codigoIbge: '4314902', nome: 'Porto Alegre', uf: 'RS', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '4106902': { codigoIbge: '4106902', nome: 'Curitiba', uf: 'PR', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.025, integradoNfeio: true },
  '4209102': { codigoIbge: '4209102', nome: 'Florianópolis', uf: 'SC', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '2927408': { codigoIbge: '2927408', nome: 'Salvador', uf: 'BA', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '2304400': { codigoIbge: '2304400', nome: 'Fortaleza', uf: 'CE', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '2611606': { codigoIbge: '2611606', nome: 'Recife', uf: 'PE', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '1302603': { codigoIbge: '1302603', nome: 'Manaus', uf: 'AM', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '5300108': { codigoIbge: '5300108', nome: 'Brasília', uf: 'DF', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '3205309': { codigoIbge: '3205309', nome: 'Vitória', uf: 'ES', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '5208707': { codigoIbge: '5208707', nome: 'Goiânia', uf: 'GO', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '5103403': { codigoIbge: '5103403', nome: 'Cuiabá', uf: 'MT', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '5002704': { codigoIbge: '5002704', nome: 'Campo Grande', uf: 'MS', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '2111300': { codigoIbge: '2111300', nome: 'São Luís', uf: 'MA', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '2800308': { codigoIbge: '2800308', nome: 'Aracaju', uf: 'SE', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '2408102': { codigoIbge: '2408102', nome: 'Natal', uf: 'RN', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '2507507': { codigoIbge: '2507507', nome: 'João Pessoa', uf: 'PB', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '2704302': { codigoIbge: '2704302', nome: 'Maceió', uf: 'AL', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '2211001': { codigoIbge: '2211001', nome: 'Teresina', uf: 'PI', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '1501402': { codigoIbge: '1501402', nome: 'Belém', uf: 'PA', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '1600303': { codigoIbge: '1600303', nome: 'Macapá', uf: 'AP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '1400100': { codigoIbge: '1400100', nome: 'Boa Vista', uf: 'RR', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '1100205': { codigoIbge: '1100205', nome: 'Porto Velho', uf: 'RO', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '1200401': { codigoIbge: '1200401', nome: 'Rio Branco', uf: 'AC', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '1721000': { codigoIbge: '1721000', nome: 'Palmas', uf: 'TO', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '3518800': { codigoIbge: '3518800', nome: 'Guarulhos', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3509502': { codigoIbge: '3509502', nome: 'Campinas', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3543402': { codigoIbge: '3543402', nome: 'Ribeirão Preto', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3548708': { codigoIbge: '3548708', nome: 'Santo André', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3552205': { codigoIbge: '3552205', nome: 'São Bernardo do Campo', uf: 'SP', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: true },
  '3301009': { codigoIbge: '3301009', nome: 'Niterói', uf: 'RJ', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: true },
  '3136702': { codigoIbge: '3136702', nome: 'Juiz de Fora', uf: 'MG', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.03, integradoNfeio: false },
  '4113700': { codigoIbge: '4113700', nome: 'Londrina', uf: 'PR', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '4115200': { codigoIbge: '4115200', nome: 'Maringá', uf: 'PR', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '4202404': { codigoIbge: '4202404', nome: 'Blumenau', uf: 'SC', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
  '4305108': { codigoIbge: '4305108', nome: 'Caxias do Sul', uf: 'RS', aliquotaIssMinima: 0.02, aliquotaIssMaxima: 0.05, aliquotaIssPadrao: 0.02, integradoNfeio: false },
};

@Injectable()
export class NfseService {
  private readonly nfeioApiKey = process.env.NFEIO_API_KEY ?? '';
  private readonly nfeioCompanyId = process.env.NFEIO_COMPANY_ID ?? '';
  private readonly nfeioBaseUrl = 'https://api.nfe.io/v1';

  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _authHeader(): string {
    const token = Buffer.from(`${this.nfeioApiKey}:`).toString('base64');
    return `Basic ${token}`;
  }

  private _round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private _calcIrRegressivo(valor: number): number {
    // Tabela progressiva IR mensal 2025 (simplificada para serviços)
    if (valor <= 2259.20) return 0;
    if (valor <= 2826.65) return this._round2(valor * 0.075 - 169.44);
    if (valor <= 3751.05) return this._round2(valor * 0.15 - 381.44);
    if (valor <= 4664.68) return this._round2(valor * 0.225 - 662.77);
    return this._round2(valor * 0.275 - 896.00);
  }

  private async _callNFeIo(endpoint: string, method: string, body?: any): Promise<any> {
    const url = `${this.nfeioBaseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this._authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`NFe.io API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  private _gerarRpsNumero(): string {
    return String(Date.now()).slice(-9);
  }

  // ─── Métodos Públicos ─────────────────────────────────────────────────────

  calcularImpostosServico(
    valor: number,
    aliquotaIss: number,
    regimeTributario: string,
    issRetido = false,
  ): ImpostoServicoResult {
    // ISS
    const issEfetivo = Math.max(0.02, Math.min(0.05, aliquotaIss || 0.03));
    const iss = this._round2(valor * issEfetivo);

    // PIS / COFINS
    let pis: number;
    let cofins: number;
    if (regimeTributario === 'simples') {
      pis = 0;
      cofins = 0;
    } else if (regimeTributario === 'real') {
      pis = this._round2(valor * 0.0165);
      cofins = this._round2(valor * 0.076);
    } else {
      pis = this._round2(valor * 0.0065);
      cofins = this._round2(valor * 0.03);
    }

    // INSS retido (tomador PJ deve reter 11% em alguns serviços)
    const inss = regimeTributario !== 'simples' ? this._round2(valor * 0.11) : 0;

    // IR retido
    const ir = regimeTributario !== 'simples' ? this._calcIrRegressivo(valor) : 0;

    // CSLL retido
    const csll = regimeTributario !== 'simples' ? this._round2(valor * 0.01) : 0;

    const totalRetencoes = this._round2(
      (issRetido ? iss : 0) + pis + cofins + inss + ir + csll,
    );
    const valorLiquido = this._round2(valor - totalRetencoes);

    return { iss, pis, cofins, inss, ir, csll, totalRetencoes, valorLiquido };
  }

  async emitirNFSe(dto: EmitirNFSeDto) {
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new NotFoundException(`Empresa ${dto.companyId} não encontrada`);

    const regime = company.taxRegime ?? 'presumido';
    const aliquotaIss = dto.valores.aliquotaIss ?? 0.03;
    const issRetido = dto.valores.issRetido ?? false;

    const impostos = this.calcularImpostosServico(dto.valores.servicos, aliquotaIss, regime, issRetido);

    const valorServicos = dto.valores.servicos;
    const valorDeducoes = dto.valores.deducoes ?? 0;
    const valorLiquido = this._round2(valorServicos - valorDeducoes - (issRetido ? impostos.iss : 0));

    const rpsNumero = this._gerarRpsNumero();
    let nfeioId: string | null = null;
    let status = 'autorizada';
    let xmlContent: string | null = null;
    let numero: number | null = null;
    let codigoVerificacao: string | null = null;
    let errorMessage: string | null = null;

    if (this.nfeioApiKey && this.nfeioCompanyId) {
      try {
        const payload = {
          cityServiceCode: dto.servico.codigoServico,
          description: dto.servico.discriminacao,
          servicesAmount: valorServicos,
          deductionsAmount: valorDeducoes,
          issRate: aliquotaIss,
          issTaxAmount: impostos.iss,
          issRetained: issRetido,
          borrower: {
            type: dto.tomador.cnpjCpf.replace(/\D/g, '').length === 14 ? 'J' : 'F',
            document: dto.tomador.cnpjCpf,
            name: dto.tomador.nome,
            email: dto.tomador.email,
            address: dto.tomador.endereco ? {
              street: dto.tomador.endereco.logradouro,
              number: dto.tomador.endereco.numero,
              additionalInformation: dto.tomador.endereco.complemento,
              district: dto.tomador.endereco.bairro,
              city: { name: dto.tomador.endereco.municipio },
              state: dto.tomador.endereco.uf,
              postalCode: dto.tomador.endereco.cep,
            } : undefined,
          },
        };

        const result = await this._callNFeIo(
          `/companies/${this.nfeioCompanyId}/serviceinvoices`,
          'POST',
          payload,
        );

        nfeioId = result.id ?? result.serviceInvoice?.id;
        numero = result.number ?? result.serviceInvoice?.number ?? null;
        codigoVerificacao = result.verificationCode ?? result.serviceInvoice?.verificationCode ?? null;
        xmlContent = JSON.stringify(result);
        status = 'autorizada';
      } catch (err) {
        status = 'stub';
        errorMessage = (err as Error).message;
        xmlContent = JSON.stringify({ stub: true, error: errorMessage });
      }
    } else {
      status = 'stub';
      xmlContent = JSON.stringify({
        stub: true,
        message: 'Credenciais NFe.io não configuradas',
        rpsNumero,
        emitidoEm: new Date().toISOString(),
      });
    }

    return this.prisma.nfseEmission.create({
      data: {
        companyId: dto.companyId,
        status,
        numero,
        codigoVerificacao,
        rpsNumero,
        rpsSerie: '1',
        rpsTipo: '1',
        dataEmissao: new Date(),
        competencia: dto.competencia,
        tomadorNome: dto.tomador.nome,
        tomadorCnpjCpf: dto.tomador.cnpjCpf,
        tomadorEmail: dto.tomador.email,
        tomadorEndereco: dto.tomador.endereco ? JSON.stringify(dto.tomador.endereco) : null,
        tomadorMunicipio: dto.tomador.endereco?.municipio,
        tomadorUf: dto.tomador.endereco?.uf,
        discriminacao: dto.servico.discriminacao,
        codigoServico: dto.servico.codigoServico,
        cnaeServico: dto.servico.cnaeServico,
        valorServicos: valorServicos,
        valorDeducoes: valorDeducoes,
        valorPis: impostos.pis,
        valorCofins: impostos.cofins,
        valorInss: impostos.inss,
        valorIr: impostos.ir,
        valorCsll: impostos.csll,
        issRetido: issRetido,
        valorIss: impostos.iss,
        aliquotaIss: aliquotaIss,
        valorLiquido: valorLiquido,
        municipioPrestacao: dto.servico.municipioPrestacao,
        codigoMunicipio: dto.servico.codigoMunicipio,
        xmlContent,
        nfeioId,
        errorMessage,
      },
    });
  }

  async cancelarNFSe(id: string, motivo: string) {
    const nfse = await this.prisma.nfseEmission.findUnique({ where: { id } });
    if (!nfse) throw new NotFoundException(`NFS-e ${id} não encontrada`);
    if (!['autorizada', 'stub'].includes(nfse.status)) {
      throw new BadRequestException('Apenas NFS-es autorizadas podem ser canceladas');
    }

    if (this.nfeioApiKey && this.nfeioCompanyId && nfse.nfeioId) {
      try {
        await this._callNFeIo(
          `/companies/${this.nfeioCompanyId}/serviceinvoices/${nfse.nfeioId}`,
          'DELETE',
          { reason: motivo },
        );
      } catch (_err) {
        // Prossegue com cancelamento local
      }
    }

    return this.prisma.nfseEmission.update({
      where: { id },
      data: {
        status: 'cancelada',
        canceledAt: new Date(),
        cancelReason: motivo,
      },
    });
  }

  async listarNFSes(companyId: string, competencia?: string, status?: string) {
    return this.prisma.nfseEmission.findMany({
      where: {
        companyId,
        ...(competencia && { competencia }),
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  consultarMunicipio(codigoIbge: string): MunicipioInfo {
    const municipio = MUNICIPIOS[codigoIbge];
    if (!municipio) {
      // Retorna padrão para municípios não catalogados
      return {
        codigoIbge,
        nome: 'Município não catalogado',
        uf: 'XX',
        aliquotaIssMinima: 0.02,
        aliquotaIssMaxima: 0.05,
        aliquotaIssPadrao: 0.03,
        integradoNfeio: false,
      };
    }
    return municipio;
  }
}
