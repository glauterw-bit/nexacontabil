import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface DfcInput {
  companyId: string;
  periodoInicio: string;
  periodoFim: string;
  metodo: 'direto' | 'indireto';
  rubricas: {
    operacionais: Array<{ descricao: string; valor: number }>;
    investimento: Array<{ descricao: string; valor: number }>;
    financiamento: Array<{ descricao: string; valor: number }>;
    saldoInicial: number;
    saldoFinal: number;
  };
  geradoPor?: string;
}

interface DmplInput {
  companyId: string;
  exercicio: number;
  capitalSocial: number;
  reservasCapital?: number;
  reservasLucros?: number;
  acoesTesouraria?: number;
  lucrosAcumulados: number;
  ajustesAvaliacao?: number;
  outrosResultados?: number;
  linhas: Array<{
    descricao: string;
    capitalSocial?: number;
    reservasCapital?: number;
    reservasLucros?: number;
    acoesTesouraria?: number;
    lucrosAcumulados?: number;
    ajustesAvaliacao?: number;
    outrosResultados?: number;
  }>;
}

@Injectable()
export class FinancialStatementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── DFC ────────────────────────────────────────────────────────
  async createDfc(input: DfcInput) {
    const sum = (arr: Array<{ valor: number }>) => arr.reduce((a, b) => a + Number(b.valor || 0), 0);
    const fco = sum(input.rubricas.operacionais);
    const fci = sum(input.rubricas.investimento);
    const fcf = sum(input.rubricas.financiamento);
    const variacao = fco + fci + fcf;
    return this.prisma.cashFlowStatement.create({
      data: {
        companyId: input.companyId,
        periodoInicio: new Date(input.periodoInicio),
        periodoFim: new Date(input.periodoFim),
        metodo: input.metodo,
        fcoOperacionais: fco,
        fcoInvestimento: fci,
        fcoFinanciamento: fcf,
        variacaoCaixa: variacao,
        saldoInicial: input.rubricas.saldoInicial,
        saldoFinal: input.rubricas.saldoFinal,
        rubricasJson: JSON.stringify(input.rubricas),
        geradoPor: input.geradoPor,
      },
    });
  }

  async listDfc(companyId: string) {
    return this.prisma.cashFlowStatement.findMany({
      where: { companyId },
      orderBy: { periodoFim: 'desc' },
    });
  }

  async getDfc(id: string) {
    const dfc = await this.prisma.cashFlowStatement.findUnique({ where: { id } });
    if (!dfc) return null;
    return { ...dfc, rubricas: JSON.parse(dfc.rubricasJson) };
  }

  /**
   * Gera DFC pelo método indireto automaticamente a partir das Transactions do período.
   * Usa convenção: rubricas operacionais = lançamentos com tag/categoria adequada.
   * Quando não houver classificação, reporta valores brutos para revisão humana.
   */
  async gerarAutomatico(companyId: string, periodoInicio: string, periodoFim: string, metodo: 'direto' | 'indireto' = 'indireto') {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: { gte: new Date(periodoInicio), lte: new Date(periodoFim) },
        status: { in: ['approved', 'posted'] },
      },
    });
    // Estimativa simples: net income ≈ total credit - total debit (proxy)
    const totalCredit = transactions.reduce((acc, t) => acc + t.totalCredit, 0);
    const totalDebit = transactions.reduce((acc, t) => acc + t.totalDebit, 0);
    const netResult = totalCredit - totalDebit;
    return this.createDfc({
      companyId,
      periodoInicio,
      periodoFim,
      metodo,
      rubricas: {
        operacionais: [
          { descricao: 'Resultado liquido do periodo (proxy via Transactions)', valor: netResult },
        ],
        investimento: [],
        financiamento: [],
        saldoInicial: 0,
        saldoFinal: netResult,
      },
    });
  }

  // ─── DMPL ───────────────────────────────────────────────────────
  async upsertDmpl(input: DmplInput) {
    const totalPL =
      input.capitalSocial +
      (input.reservasCapital || 0) +
      (input.reservasLucros || 0) -
      (input.acoesTesouraria || 0) +
      input.lucrosAcumulados +
      (input.ajustesAvaliacao || 0) +
      (input.outrosResultados || 0);
    return this.prisma.equityMutationStatement.upsert({
      where: { companyId_exercicio: { companyId: input.companyId, exercicio: input.exercicio } },
      create: {
        companyId: input.companyId,
        exercicio: input.exercicio,
        capitalSocial: input.capitalSocial,
        reservasCapital: input.reservasCapital ?? 0,
        reservasLucros: input.reservasLucros ?? 0,
        acoesTesouraria: input.acoesTesouraria ?? 0,
        lucrosAcumulados: input.lucrosAcumulados,
        ajustesAvaliacao: input.ajustesAvaliacao ?? 0,
        outrosResultados: input.outrosResultados ?? 0,
        totalPL,
        linhasJson: JSON.stringify(input.linhas),
      },
      update: {
        capitalSocial: input.capitalSocial,
        reservasCapital: input.reservasCapital ?? 0,
        reservasLucros: input.reservasLucros ?? 0,
        acoesTesouraria: input.acoesTesouraria ?? 0,
        lucrosAcumulados: input.lucrosAcumulados,
        ajustesAvaliacao: input.ajustesAvaliacao ?? 0,
        outrosResultados: input.outrosResultados ?? 0,
        totalPL,
        linhasJson: JSON.stringify(input.linhas),
      },
    });
  }

  async listDmpl(companyId: string) {
    return this.prisma.equityMutationStatement.findMany({
      where: { companyId },
      orderBy: { exercicio: 'desc' },
    });
  }
}
