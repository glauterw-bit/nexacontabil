import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface CalcImpostosParams {
  ufEmitente: string;
  ufDestinatario: string;
  ncm: string;
  cfop: string;
  valor: number;
  qtd: number;
  regimeTributario: string; // simples | presumido | real
  tipoContribuinte?: string; // contribuinte | consumidor_final
}

export interface IcmsResult {
  cst: string;
  aliquota: number;
  baseCalculo: number;
  valor: number;
  reducaoBc: number;
}

export interface IpiResult {
  cst: string;
  aliquota: number;
  valor: number;
}

export interface PisCofinsResult {
  cst: string;
  aliquota: number;
  valor: number;
}

export interface ImpostosResult {
  icms: IcmsResult;
  ipi: IpiResult;
  pis: PisCofinsResult;
  cofins: PisCofinsResult;
  total: number;
}

export interface NcmInfo {
  codigo: string;
  descricao: string;
  aliquotaIpi: number;
  unidade: string;
}

export interface CfopInfo {
  codigo: string;
  descricao: string;
  tipo: string;
  aplicacao: string;
}

export interface DifalResult {
  aliquotaInterestadual: number;
  aliquotaInterna: number;
  difal: number;
  partilhaDestino: number;
  partilhaOrigem: number;
}

// ─── Tabelas Hardcoded ────────────────────────────────────────────────────────

const UF_INTERNAS: Record<string, number> = {
  SP: 0.18, RJ: 0.20, MG: 0.18, RS: 0.18, PR: 0.12,
  SC: 0.17, ES: 0.17, DF: 0.18, GO: 0.17, MT: 0.17,
  MS: 0.17, BA: 0.19, PE: 0.18, CE: 0.18, AM: 0.20,
  PA: 0.17, MA: 0.22, PI: 0.21, RN: 0.18, PB: 0.18,
  AL: 0.19, SE: 0.19, TO: 0.20, RO: 0.17, AC: 0.17,
  AP: 0.17, RR: 0.17,
};

const UF_SUL_SUDESTE = ['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'ES'];

const NCM_TABLE: Record<string, NcmInfo> = {
  '84089000': { codigo: '84089000', descricao: 'Outras partes para motores de pistão', aliquotaIpi: 5, unidade: 'UN' },
  '84118200': { codigo: '84118200', descricao: 'Turbinas de gás para aeronaves', aliquotaIpi: 5, unidade: 'UN' },
  '84149090': { codigo: '84149090', descricao: 'Partes de compressores e ventiladores', aliquotaIpi: 5, unidade: 'UN' },
  '84158100': { codigo: '84158100', descricao: 'Aparelhos de ar condicionado', aliquotaIpi: 5, unidade: 'UN' },
  '84181000': { codigo: '84181000', descricao: 'Refrigeradores domésticos combinados', aliquotaIpi: 5, unidade: 'UN' },
  '84212300': { codigo: '84212300', descricao: 'Aparelhos para filtrar óleos minerais', aliquotaIpi: 5, unidade: 'UN' },
  '84279010': { codigo: '84279010', descricao: 'Empilhadeiras elétricas', aliquotaIpi: 5, unidade: 'UN' },
  '84313100': { codigo: '84313100', descricao: 'Partes de elevadores e monta-cargas', aliquotaIpi: 5, unidade: 'UN' },
  '84713012': { codigo: '84713012', descricao: 'Laptops e notebooks', aliquotaIpi: 5, unidade: 'UN' },
  '84716040': { codigo: '84716040', descricao: 'Unidades de processamento', aliquotaIpi: 5, unidade: 'UN' },
  '84729099': { codigo: '84729099', descricao: 'Outras máquinas de escritório', aliquotaIpi: 5, unidade: 'UN' },
  '84798200': { codigo: '84798200', descricao: 'Misturadores de plástico', aliquotaIpi: 5, unidade: 'UN' },
  '85171210': { codigo: '85171210', descricao: 'Telefones celulares', aliquotaIpi: 15, unidade: 'UN' },
  '85176230': { codigo: '85176230', descricao: 'Aparelhos para radiodifusão', aliquotaIpi: 10, unidade: 'UN' },
  '85219000': { codigo: '85219000', descricao: 'Aparelhos videofônicos de gravação', aliquotaIpi: 10, unidade: 'UN' },
  '85258021': { codigo: '85258021', descricao: 'Câmeras de vídeo', aliquotaIpi: 10, unidade: 'UN' },
  '85299020': { codigo: '85299020', descricao: 'Antenas para TV satélite', aliquotaIpi: 10, unidade: 'UN' },
  '85371090': { codigo: '85371090', descricao: 'Quadros e painéis elétricos', aliquotaIpi: 5, unidade: 'UN' },
  '87011000': { codigo: '87011000', descricao: 'Motocultores', aliquotaIpi: 25, unidade: 'UN' },
  '87021000': { codigo: '87021000', descricao: 'Ônibus a diesel', aliquotaIpi: 25, unidade: 'UN' },
  '87032110': { codigo: '87032110', descricao: 'Automóveis a gasolina até 1000cc', aliquotaIpi: 7, unidade: 'UN' },
  '87032190': { codigo: '87032190', descricao: 'Automóveis a gasolina acima de 1000cc', aliquotaIpi: 13, unidade: 'UN' },
  '87033090': { codigo: '87033090', descricao: 'Automóveis diesel acima de 3000cc', aliquotaIpi: 25, unidade: 'UN' },
  '87042210': { codigo: '87042210', descricao: 'Caminhões diesel de carga', aliquotaIpi: 25, unidade: 'UN' },
  '87050000': { codigo: '87050000', descricao: 'Veículos para fins especiais', aliquotaIpi: 25, unidade: 'UN' },
  '87082990': { codigo: '87082990', descricao: 'Partes e acessórios de veículos', aliquotaIpi: 25, unidade: 'UN' },
  '87111000': { codigo: '87111000', descricao: 'Motocicletas até 50cc', aliquotaIpi: 25, unidade: 'UN' },
  '87112000': { codigo: '87112000', descricao: 'Motocicletas de 50cc a 250cc', aliquotaIpi: 25, unidade: 'UN' },
  '90181900': { codigo: '90181900', descricao: 'Outros aparelhos de medicina', aliquotaIpi: 0, unidade: 'UN' },
  '94012900': { codigo: '94012900', descricao: 'Assentos e cadeiras', aliquotaIpi: 5, unidade: 'UN' },
  '94033000': { codigo: '94033000', descricao: 'Móveis de madeira para escritório', aliquotaIpi: 5, unidade: 'UN' },
  '33030010': { codigo: '33030010', descricao: 'Perfumes (extratos)', aliquotaIpi: 60, unidade: 'UN' },
  '33041000': { codigo: '33041000', descricao: 'Produtos de maquiagem para lábios', aliquotaIpi: 20, unidade: 'UN' },
  '33049900': { codigo: '33049900', descricao: 'Outros produtos de beleza', aliquotaIpi: 20, unidade: 'UN' },
  '22030000': { codigo: '22030000', descricao: 'Cerveja de malte', aliquotaIpi: 30, unidade: 'LT' },
  '22021000': { codigo: '22021000', descricao: 'Água mineral gaseificada', aliquotaIpi: 5, unidade: 'LT' },
  '24021000': { codigo: '24021000', descricao: 'Charutos e cigarrilhas de tabaco', aliquotaIpi: 30, unidade: 'UN' },
  '24022000': { codigo: '24022000', descricao: 'Cigarros contendo tabaco', aliquotaIpi: 300, unidade: 'CX' },
  '27101259': { codigo: '27101259', descricao: 'Gasolina tipo A', aliquotaIpi: 10, unidade: 'LT' },
  '27101922': { codigo: '27101922', descricao: 'Óleo diesel', aliquotaIpi: 10, unidade: 'LT' },
  '39011000': { codigo: '39011000', descricao: 'Polietileno de baixa densidade', aliquotaIpi: 5, unidade: 'KG' },
  '39231000': { codigo: '39231000', descricao: 'Caixas de plástico para transporte', aliquotaIpi: 5, unidade: 'UN' },
  '62034200': { codigo: '62034200', descricao: 'Calças de algodão masculinas', aliquotaIpi: 0, unidade: 'UN' },
  '62044200': { codigo: '62044200', descricao: 'Vestidos de algodão femininos', aliquotaIpi: 0, unidade: 'UN' },
  '64041100': { codigo: '64041100', descricao: 'Calçados de sola de borracha', aliquotaIpi: 10, unidade: 'PAR' },
  '73061000': { codigo: '73061000', descricao: 'Tubos de aço soldados', aliquotaIpi: 0, unidade: 'KG' },
  '76061100': { codigo: '76061100', descricao: 'Chapas de alumínio', aliquotaIpi: 0, unidade: 'KG' },
  '84811000': { codigo: '84811000', descricao: 'Válvulas redutoras de pressão', aliquotaIpi: 5, unidade: 'UN' },
  '90262000': { codigo: '90262000', descricao: 'Instrumentos para medida de pressão', aliquotaIpi: 5, unidade: 'UN' },
  '01012100': { codigo: '01012100', descricao: 'Cavalos puros-sangue', aliquotaIpi: 0, unidade: 'UN' },
  '02011000': { codigo: '02011000', descricao: 'Carcaças de bovinos frescas', aliquotaIpi: 0, unidade: 'KG' },
  '10011100': { codigo: '10011100', descricao: 'Trigo duro', aliquotaIpi: 0, unidade: 'KG' },
  '10059010': { codigo: '10059010', descricao: 'Milho em grão', aliquotaIpi: 0, unidade: 'KG' },
  '12010010': { codigo: '12010010', descricao: 'Soja em grão', aliquotaIpi: 0, unidade: 'KG' },
};

const CFOP_TABLE: CfopInfo[] = [
  { codigo: '1102', descricao: 'Compra para comercialização (estadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '1111', descricao: 'Compra para industrialização (estadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '1202', descricao: 'Devolução de venda de produção do estabelecimento (estadual)', tipo: 'entrada', aplicacao: 'devolucao' },
  { codigo: '1352', descricao: 'Aquisição de serviço de transporte (estadual)', tipo: 'entrada', aplicacao: 'servico' },
  { codigo: '1403', descricao: 'Compra de mercadoria para uso ou consumo (estadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '1556', descricao: 'Compra de material para uso ou consumo (estadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '1601', descricao: 'Recebimento de transferência de estoque (estadual)', tipo: 'entrada', aplicacao: 'transferencia' },
  { codigo: '1152', descricao: 'Transferência de produção do estabelecimento (estadual)', tipo: 'entrada', aplicacao: 'transferencia' },
  { codigo: '2102', descricao: 'Compra para comercialização (interestadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '2111', descricao: 'Compra para industrialização (interestadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '2202', descricao: 'Devolução de venda de produção do estabelecimento (interestadual)', tipo: 'entrada', aplicacao: 'devolucao' },
  { codigo: '2352', descricao: 'Aquisição de serviço de transporte (interestadual)', tipo: 'entrada', aplicacao: 'servico' },
  { codigo: '2403', descricao: 'Compra de mercadoria para uso ou consumo (interestadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '2556', descricao: 'Compra de material para uso ou consumo (interestadual)', tipo: 'entrada', aplicacao: 'compra' },
  { codigo: '2152', descricao: 'Transferência de produção do estabelecimento (interestadual)', tipo: 'entrada', aplicacao: 'transferencia' },
  { codigo: '5102', descricao: 'Venda de mercadoria adquirida para comercialização (estadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '5101', descricao: 'Venda de produção do estabelecimento (estadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '5111', descricao: 'Venda de produção do estabelecimento de terceiro (estadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '5202', descricao: 'Devolução de compra para comercialização (estadual)', tipo: 'saida', aplicacao: 'devolucao' },
  { codigo: '5552', descricao: 'Transferência de bem do ativo imobilizado (estadual)', tipo: 'saida', aplicacao: 'transferencia' },
  { codigo: '5152', descricao: 'Transferência de mercadoria adquirida para comercialização (estadual)', tipo: 'saida', aplicacao: 'transferencia' },
  { codigo: '5912', descricao: 'Remessa de mercadoria ou bem em consignação mercantil (estadual)', tipo: 'saida', aplicacao: 'remessa' },
  { codigo: '5913', descricao: 'Retorno de mercadoria ou bem recebido em consignação (estadual)', tipo: 'saida', aplicacao: 'retorno' },
  { codigo: '5922', descricao: 'Lançamento efetuado a título de simples faturamento decorrente de venda para entrega futura', tipo: 'saida', aplicacao: 'outros' },
  { codigo: '5929', descricao: 'Lançamento efetuado em decorrência de emissão de documento fiscal relativo à operação', tipo: 'saida', aplicacao: 'outros' },
  { codigo: '6102', descricao: 'Venda de mercadoria adquirida para comercialização (interestadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '6101', descricao: 'Venda de produção do estabelecimento (interestadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '6111', descricao: 'Venda de produção do estabelecimento de terceiro (interestadual)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '6202', descricao: 'Devolução de compra para comercialização (interestadual)', tipo: 'saida', aplicacao: 'devolucao' },
  { codigo: '6152', descricao: 'Transferência de mercadoria adquirida para comercialização (interestadual)', tipo: 'saida', aplicacao: 'transferencia' },
  { codigo: '6912', descricao: 'Remessa de mercadoria em consignação mercantil (interestadual)', tipo: 'saida', aplicacao: 'remessa' },
  { codigo: '6913', descricao: 'Retorno de mercadoria recebida em consignação (interestadual)', tipo: 'saida', aplicacao: 'retorno' },
  { codigo: '7101', descricao: 'Venda de produção do estabelecimento (exportação)', tipo: 'saida', aplicacao: 'venda' },
  { codigo: '7102', descricao: 'Venda de mercadoria adquirida para comercialização (exportação)', tipo: 'saida', aplicacao: 'venda' },
];

@Injectable()
export class MotorTributarioService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private _round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private _aliquotaInterestadual(ufOrig: string, ufDest: string): number {
    const origSulSudeste = UF_SUL_SUDESTE.includes(ufOrig.toUpperCase());
    const destSulSudeste = UF_SUL_SUDESTE.includes(ufDest.toUpperCase());
    if (origSulSudeste && !destSulSudeste) return 0.07;
    return 0.12;
  }

  private _aliquotaInterna(uf: string): number {
    return UF_INTERNAS[uf.toUpperCase()] ?? 0.17;
  }

  private _aliquotaIpiNcm(ncm: string): number {
    // Tenta match exato
    if (NCM_TABLE[ncm]) return NCM_TABLE[ncm].aliquotaIpi / 100;
    // Match por prefixo de capítulo (2 dígitos)
    const capitulo = ncm.substring(0, 2);
    if (capitulo === '84') return 0.05;
    if (capitulo === '87') return 0.25;
    return 0;
  }

  // ─── Métodos Públicos ─────────────────────────────────────────────────────

  calcularICMS(
    ufOrig: string,
    ufDest: string,
    _ncm: string,
    valor: number,
    regime: string,
  ): IcmsResult {
    const mesmoEstado = ufOrig.toUpperCase() === ufDest.toUpperCase();
    const aliquota = mesmoEstado
      ? this._aliquotaInterna(ufOrig)
      : this._aliquotaInterestadual(ufOrig, ufDest);

    let cst: string;
    let reducaoBc = 0;

    if (regime === 'simples') {
      cst = '102'; // sem crédito
    } else {
      // Lucro Presumido / Real
      cst = '000'; // tributado integral
    }

    const baseCalculo = this._round2(valor * (1 - reducaoBc));
    const valorIcms = this._round2(baseCalculo * aliquota);

    return {
      cst,
      aliquota,
      baseCalculo,
      valor: valorIcms,
      reducaoBc,
    };
  }

  calcularIPI(ncm: string, valor: number, cfop: string): IpiResult {
    // CFOP de saída: 5xxx ou 6xxx
    const isSaida = cfop.startsWith('5') || cfop.startsWith('6');
    const aliquota = isSaida ? this._aliquotaIpiNcm(ncm) : 0;
    const tributado = aliquota > 0;

    return {
      cst: tributado ? '50' : '53',
      aliquota,
      valor: this._round2(valor * aliquota),
    };
  }

  calcularPisCofins(
    valor: number,
    regime: string,
    _cfop: string,
  ): { pis: PisCofinsResult; cofins: PisCofinsResult } {
    let aliquotaPis: number;
    let aliquotaCofins: number;
    let cstPis: string;
    let cstCofins: string;

    if (regime === 'simples') {
      aliquotaPis = 0;
      aliquotaCofins = 0;
      cstPis = '07';
      cstCofins = '07';
    } else if (regime === 'real') {
      // Não cumulativo
      aliquotaPis = 0.0165;
      aliquotaCofins = 0.076;
      cstPis = '01';
      cstCofins = '01';
    } else {
      // Presumido — cumulativo
      aliquotaPis = 0.0065;
      aliquotaCofins = 0.03;
      cstPis = '01';
      cstCofins = '01';
    }

    return {
      pis: {
        cst: cstPis,
        aliquota: aliquotaPis,
        valor: this._round2(valor * aliquotaPis),
      },
      cofins: {
        cst: cstCofins,
        aliquota: aliquotaCofins,
        valor: this._round2(valor * aliquotaCofins),
      },
    };
  }

  calcularImpostosSaida(params: CalcImpostosParams): ImpostosResult {
    const { ufEmitente, ufDestinatario, ncm, cfop, valor, regimeTributario } = params;

    const icms = this.calcularICMS(ufEmitente, ufDestinatario, ncm, valor, regimeTributario);
    const ipi = this.calcularIPI(ncm, valor, cfop);
    const { pis, cofins } = this.calcularPisCofins(valor, regimeTributario, cfop);

    const total = this._round2(icms.valor + ipi.valor + pis.valor + cofins.valor);

    return { icms, ipi, pis, cofins, total };
  }

  sugerirCfop(tipoOperacao: string, ufOrig: string, ufDest: string): string {
    const mesmoEstado = ufOrig.toUpperCase() === ufDest.toUpperCase();

    const mapa: Record<string, string> = {
      venda_estadual: '5102',
      venda_interestadual: '6102',
      compra_estadual: '1102',
      compra_interestadual: '2102',
      devolucao_venda_est: '5202',
      devolucao_venda_int: '6202',
      remessa_consignacao: '5912',
      retorno_consignacao: '5913',
      transferencia_est: '5152',
      transferencia_int: '6152',
    };

    // Se tipoOperacao inclui venda/compra sem sufixo estadual/interestadual, inferir
    if (tipoOperacao === 'venda') return mesmoEstado ? '5102' : '6102';
    if (tipoOperacao === 'compra') return mesmoEstado ? '1102' : '2102';
    if (tipoOperacao === 'devolucao_venda') return mesmoEstado ? '5202' : '6202';
    if (tipoOperacao === 'transferencia') return mesmoEstado ? '5152' : '6152';

    return mapa[tipoOperacao] ?? '5102';
  }

  async buscarNCM(codigo: string): Promise<NcmInfo> {
    // Tenta no banco primeiro
    try {
      const ncmDb = await this.prisma.ncmCode.findUnique({ where: { codigo } });
      if (ncmDb) {
        return {
          codigo: ncmDb.codigo,
          descricao: ncmDb.descricao,
          aliquotaIpi: ncmDb.aliquotaIpi,
          unidade: ncmDb.unidade,
        };
      }
    } catch (_e) {
      // fallback para tabela hardcoded
    }

    // Tabela hardcoded
    if (NCM_TABLE[codigo]) return NCM_TABLE[codigo];

    // Match por prefixo
    const prefixo8 = Object.keys(NCM_TABLE).find(k => k.startsWith(codigo));
    if (prefixo8) return NCM_TABLE[prefixo8];

    return {
      codigo,
      descricao: 'NCM não encontrado na tabela de referência',
      aliquotaIpi: 0,
      unidade: 'UN',
    };
  }

  async listarCFOPs(): Promise<CfopInfo[]> {
    try {
      const cfopsDb = await this.prisma.cfopCode.findMany({ orderBy: { codigo: 'asc' } });
      if (cfopsDb.length > 0) {
        return cfopsDb.map(c => ({
          codigo: c.codigo,
          descricao: c.descricao,
          tipo: c.tipo,
          aplicacao: c.aplicacao,
        }));
      }
    } catch (_e) {
      // fallback
    }
    return CFOP_TABLE;
  }

  calcularDIFAL(
    ufOrigem: string,
    ufDestino: string,
    valor: number,
    aliquotaInterna: number,
  ): DifalResult {
    const aliquotaInterestadual = this._aliquotaInterestadual(ufOrigem, ufDestino);
    const diferencial = aliquotaInterna - aliquotaInterestadual;
    const difal = this._round2(valor * diferencial);

    // Partilha 2024: 100% destinatário
    return {
      aliquotaInterestadual,
      aliquotaInterna,
      difal,
      partilhaDestino: difal,
      partilhaOrigem: 0,
    };
  }
}
