import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// Tabelas Simples Nacional 2024 - Resolução CGSN 140/2018
const ANEXO_I = [
  { ate: 180000,  aliq: 0.04,  deducao: 0 },
  { ate: 360000,  aliq: 0.073, deducao: 5940 },
  { ate: 720000,  aliq: 0.095, deducao: 13860 },
  { ate: 1800000, aliq: 0.107, deducao: 22500 },
  { ate: 3600000, aliq: 0.143, deducao: 87300 },
  { ate: 4800000, aliq: 0.19,  deducao: 378000 },
];
const ANEXO_II = [
  { ate: 180000,  aliq: 0.045, deducao: 0 },
  { ate: 360000,  aliq: 0.078, deducao: 5940 },
  { ate: 720000,  aliq: 0.10,  deducao: 13860 },
  { ate: 1800000, aliq: 0.112, deducao: 22500 },
  { ate: 3600000, aliq: 0.147, deducao: 85500 },
  { ate: 4800000, aliq: 0.30,  deducao: 720000 },
];
const ANEXO_III = [
  { ate: 180000,  aliq: 0.06,  deducao: 0 },
  { ate: 360000,  aliq: 0.112, deducao: 9360 },
  { ate: 720000,  aliq: 0.135, deducao: 17640 },
  { ate: 1800000, aliq: 0.16,  deducao: 35640 },
  { ate: 3600000, aliq: 0.21,  deducao: 125640 },
  { ate: 4800000, aliq: 0.33,  deducao: 648000 },
];
const ANEXO_IV = [
  { ate: 180000,  aliq: 0.045, deducao: 0 },
  { ate: 360000,  aliq: 0.09,  deducao: 8100 },
  { ate: 720000,  aliq: 0.102, deducao: 12420 },
  { ate: 1800000, aliq: 0.14,  deducao: 39780 },
  { ate: 3600000, aliq: 0.22,  deducao: 183780 },
  { ate: 4800000, aliq: 0.33,  deducao: 828000 },
];
const ANEXO_V = [
  { ate: 180000,  aliq: 0.155, deducao: 0 },
  { ate: 360000,  aliq: 0.18,  deducao: 4500 },
  { ate: 720000,  aliq: 0.195, deducao: 9900 },
  { ate: 1800000, aliq: 0.205, deducao: 17100 },
  { ate: 3600000, aliq: 0.23,  deducao: 62100 },
  { ate: 4800000, aliq: 0.305, deducao: 540000 },
];

type Faixa = { ate: number; aliq: number; deducao: number };

function calcAliquotaEfetiva(rbt12: number, tabela: Faixa[]): number {
  if (rbt12 <= 0) return tabela[0].aliq;
  const faixa = tabela.find(f => rbt12 <= f.ate) || tabela[tabela.length - 1];
  return ((rbt12 * faixa.aliq) - faixa.deducao) / rbt12;
}

function getFaixaIndex(rbt12: number, tabela: Faixa[]): number {
  const idx = tabela.findIndex(f => rbt12 <= f.ate);
  return idx === -1 ? tabela.length - 1 : idx;
}

function getTabela(taxRegime: string): { tabela: Faixa[]; nome: string } {
  const mapa: Record<string, { tabela: Faixa[]; nome: string }> = {
    SIMPLES_I:   { tabela: ANEXO_I,   nome: 'I' },
    SIMPLES_II:  { tabela: ANEXO_II,  nome: 'II' },
    SIMPLES_III: { tabela: ANEXO_III, nome: 'III' },
    SIMPLES_IV:  { tabela: ANEXO_IV,  nome: 'IV' },
    SIMPLES_V:   { tabela: ANEXO_V,   nome: 'V' },
  };
  return mapa[taxRegime] || { tabela: ANEXO_III, nome: 'III' };
}

@Injectable()
export class SimplesNacionalService {
  constructor(private prisma: PrismaService) {}

  async calcularPGDAS(companyId: string, competencia: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const [ano, mes] = competencia.split('-').map(Number);
    const dtFim = new Date(ano, mes - 1, 1);
    const dtIni = new Date(ano - 1, mes - 1, 1);

    // RBT12 — receita bruta últimos 12 meses (totalCredit = créditos = receitas)
    const trans12 = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: dtIni, lt: dtFim } },
    });
    const rbt12 = trans12.reduce((s, t) => s + Number(t.totalCredit), 0);

    // Receita do mês
    const dtMesIni = new Date(ano, mes - 1, 1);
    const dtMesFim = new Date(ano, mes, 1);
    const transMes = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: dtMesIni, lt: dtMesFim } },
    });
    const receitaMes = transMes.reduce((s, t) => s + Number(t.totalCredit), 0);

    // Fator R — massa salarial 12 meses / RBT12
    const folha = await this.prisma.payslip.findMany({
      where: { companyId, referenceMonth: { gte: `${ano - 1}-${String(mes).padStart(2, '0')}`, lt: competencia } },
    });
    const massaSalarial = folha.reduce((s, p) => s + Number(p.grossSalary || 0), 0);
    const fatorR = rbt12 > 0 ? massaSalarial / rbt12 : 0;

    const { tabela, nome: anexo } = getTabela(company.taxRegime);
    const aliquotaNominal = tabela.find(f => rbt12 <= f.ate)?.aliq || tabela[tabela.length - 1].aliq;
    const valorDeduzir = tabela.find(f => rbt12 <= f.ate)?.deducao || 0;
    const aliquotaEfetiva = calcAliquotaEfetiva(rbt12, tabela);
    const valorDas = receitaMes * aliquotaEfetiva;
    const faixaIdx = getFaixaIndex(rbt12, tabela);

    // Partilha simplificada por anexo
    const partilha = buildPartilha(anexo, faixaIdx, valorDas);

    // Upsert apuração
    const existing = await this.prisma.simplesApuracao.findFirst({ where: { companyId, competencia } });
    const data = {
      companyId, competencia, anexo,
      rbt12, receitaMes,
      aliquotaNominal,
      fatorR,
      valorDeduzir,
      aliquotaEfetiva,
      valorDas,
      partilha: JSON.stringify(partilha),
      status: 'calculado',
    };

    const apuracao = existing
      ? await this.prisma.simplesApuracao.update({ where: { id: existing.id }, data })
      : await this.prisma.simplesApuracao.create({ data });

    return {
      ...apuracao,
      aliquotaEfetivaPercent: Number((aliquotaEfetiva * 100).toFixed(4)),
      fatorRPercent: Number((fatorR * 100).toFixed(2)),
      partilhaDetalhada: partilha,
    };
  }

  async listarApuracoes(companyId: string) {
    return this.prisma.simplesApuracao.findMany({
      where: { companyId },
      orderBy: { competencia: 'desc' },
    });
  }

  async gerarDAS(apuracaoId: string) {
    const ap = await this.prisma.simplesApuracao.findUnique({ where: { id: apuracaoId } });
    if (!ap) throw new NotFoundException('Apuração não encontrada');

    const codigoBarras = gerarCodigoBarras(ap);

    return this.prisma.simplesApuracao.update({
      where: { id: apuracaoId },
      data: { status: 'pgdas_gerado', codigoBarras },
    });
  }

  async simularRegimes(companyId: string, competencia: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const [ano, mes] = competencia.split('-').map(Number);
    const dtFim = new Date(ano, mes - 1, 1);
    const dtIni = new Date(ano - 1, mes - 1, 1);

    const transAll = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: dtIni, lt: dtFim } },
    });

    const rbt12 = transAll.reduce((s, t) => s + Number(t.totalCredit), 0);
    const totalDespesas = transAll.reduce((s, t) => s + Number(t.totalDebit), 0);
    const receitaMensal = rbt12 / 12;
    const margemLucro = rbt12 > 0 ? (rbt12 - totalDespesas) / rbt12 : 0.30;

    const aliqSimples = calcAliquotaEfetiva(rbt12, ANEXO_III);
    const tributosSimples = receitaMensal * aliqSimples;

    const baseIRPJ_LP = receitaMensal * 0.32;
    const irpj_LP = baseIRPJ_LP * 0.15 + Math.max(0, baseIRPJ_LP - 20000) * 0.10;
    const csll_LP = receitaMensal * 0.32 * 0.09;
    const tributosLP = irpj_LP + csll_LP + receitaMensal * 0.0065 + receitaMensal * 0.03;

    const lucroReal = receitaMensal * margemLucro;
    const irpj_LR = Math.max(0, lucroReal) * 0.15 + Math.max(0, lucroReal - 20000) * 0.10;
    const csll_LR = Math.max(0, lucroReal) * 0.09;
    const pis_LR = receitaMensal * 0.0165 - (totalDespesas / 12) * 0.0165;
    const cofins_LR = receitaMensal * 0.076 - (totalDespesas / 12) * 0.076;
    const tributosLR = irpj_LR + csll_LR + Math.max(0, pis_LR) + Math.max(0, cofins_LR);

    const melhorRegime = tributosSimples <= tributosLP && tributosSimples <= tributosLR
      ? 'Simples Nacional'
      : tributosLP <= tributosLR ? 'Lucro Presumido' : 'Lucro Real';

    return {
      rbt12,
      receitaMensal,
      simplesNacional: {
        aliquota: Number((aliqSimples * 100).toFixed(2)),
        tributacaoMensal: Number(tributosSimples.toFixed(2)),
        tributacaoAnual: Number((tributosSimples * 12).toFixed(2)),
      },
      lucroPresumido: {
        aliquotaEfetiva: Number(((tributosLP / receitaMensal) * 100).toFixed(2)),
        tributacaoMensal: Number(tributosLP.toFixed(2)),
        tributacaoAnual: Number((tributosLP * 12).toFixed(2)),
      },
      lucroReal: {
        aliquotaEfetiva: Number(((tributosLR / receitaMensal) * 100).toFixed(2)),
        tributacaoMensal: Number(tributosLR.toFixed(2)),
        tributacaoAnual: Number((tributosLR * 12).toFixed(2)),
      },
      melhorRegime,
      economiaMensal: String(Number(
        Math.abs(
          Math.max(tributosLP, tributosLR, tributosSimples) -
          Math.min(tributosLP, tributosLR, tributosSimples)
        )
      ).toFixed(2)),
    };
  }
}

function buildPartilha(anexo: string, _faixaIdx: number, das: number) {
  const pct: Record<string, number[]> = {
    I:   [0.040, 0.035, 0.154, 0.0335, 0.2315, 0.435, 0, 0],
    II:  [0.036, 0.031, 0.138, 0.030,  0.216,  0.42,  0, 0.029],
    III: [0.040, 0.035, 0.124, 0.0267, 0.432,  0,     0.3333, 0],
    IV:  [0.180, 0.150, 0.427, 0.093,  0,      0,     0.15, 0],
    V:   [0.150, 0.100, 0.282, 0.061,  0.28,   0,     0.125, 0],
  };
  const p = pct[anexo] || pct['III'];
  const [irpj, csll, cofins, pis, cpp, icms, iss, ipi] = p.map(v => Number((das * v).toFixed(2)));
  return { irpj, csll, cofins, pis, cpp, icms, iss, ipi };
}

function gerarCodigoBarras(ap: any): string {
  const valor = Math.round(Number(ap.valorDas) * 100).toString().padStart(10, '0');
  const periodo = ap.competencia.replace('-', '');
  return `8500000${valor}${periodo}00000000001`;
}
