import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface AccountingEntry {
  accountCode: string;
  accountName: string;
  nature: 'debit' | 'credit';
  value: number;
  costCenter?: string;
  description?: string;
}

interface DREGroup {
  code: string;
  name: string;
  accounts: Array<{ code: string; name: string; debit: number; credit: number; net: number }>;
  totalDebit: number;
  totalCredit: number;
  net: number;
}

interface DREResult {
  companyId: string;
  period: { from: string; to: string };
  groups: DREGroup[];
  grossRevenue: number;
  totalCosts: number;
  grossProfit: number;
  operationalExpenses: number;
  ebit: number;
  financialResult: number;
  ebt: number;
  taxes: number;
  netIncome: number;
  generatedAt: string;
}

// Prefixos do Plano de Contas Contábil Brasileiro (NBC TG)
const DRE_GROUPS: Array<{ code: string; name: string; prefixes: string[]; nature: 'revenue' | 'cost' | 'expense' | 'financial' | 'tax' }> = [
  { code: '3.1', name: 'Receita Bruta de Vendas', prefixes: ['3.1', '31'], nature: 'revenue' },
  { code: '3.2', name: 'Deduções da Receita', prefixes: ['3.2', '32'], nature: 'cost' },
  { code: '4.1', name: 'Custo dos Produtos/Serviços Vendidos', prefixes: ['4.1', '41'], nature: 'cost' },
  { code: '5.1', name: 'Despesas com Vendas', prefixes: ['5.1', '51'], nature: 'expense' },
  { code: '5.2', name: 'Despesas Administrativas', prefixes: ['5.2', '52'], nature: 'expense' },
  { code: '5.3', name: 'Despesas de Pessoal', prefixes: ['5.3', '53'], nature: 'expense' },
  { code: '5.4', name: 'Despesas Gerais', prefixes: ['5.4', '54'], nature: 'expense' },
  { code: '6.1', name: 'Receitas Financeiras', prefixes: ['6.1', '61'], nature: 'financial' },
  { code: '6.2', name: 'Despesas Financeiras', prefixes: ['6.2', '62'], nature: 'financial' },
  { code: '7.1', name: 'Impostos sobre Lucro (IR/CSLL)', prefixes: ['7.1', '71'], nature: 'tax' },
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDRE(companyId: string, from: Date, to: Date): Promise<DREResult> {
    // Busca todas as transações aprovadas no período
    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        status: 'approved',
        date: { gte: from, lte: to },
      },
    });

    // Acumula saldos por código de conta
    const accountMap = new Map<string, { name: string; debit: number; credit: number }>();

    for (const tx of transactions) {
      let entries: AccountingEntry[] = [];
      try {
        entries = JSON.parse(tx.entries as string) as AccountingEntry[];
      } catch {
        continue;
      }

      for (const entry of entries) {
        const code = entry.accountCode;
        const existing = accountMap.get(code) ?? { name: entry.accountName, debit: 0, credit: 0 };
        if (entry.nature === 'debit') {
          existing.debit += entry.value;
        } else {
          existing.credit += entry.value;
        }
        accountMap.set(code, existing);
      }
    }

    // Agrupa por grupo DRE
    const groups: DREGroup[] = DRE_GROUPS.map(group => {
      const accounts: DREGroup['accounts'] = [];
      let totalDebit = 0;
      let totalCredit = 0;

      for (const [code, data] of accountMap.entries()) {
        const belongs = group.prefixes.some(p => code.startsWith(p));
        if (!belongs) continue;

        const net = data.credit - data.debit;
        accounts.push({ code, name: data.name, debit: data.debit, credit: data.credit, net });
        totalDebit += data.debit;
        totalCredit += data.credit;
      }

      return {
        code: group.code,
        name: group.name,
        accounts,
        totalDebit: Math.round(totalDebit * 100) / 100,
        totalCredit: Math.round(totalCredit * 100) / 100,
        net: Math.round((totalCredit - totalDebit) * 100) / 100,
      };
    });

    // Calcula as linhas do DRE
    const getGroupNet = (code: string) =>
      groups.find(g => g.code === code)?.net ?? 0;

    const grossRevenue = getGroupNet('3.1');
    const revenueDeductions = getGroupNet('3.2');
    const netRevenue = grossRevenue - Math.abs(revenueDeductions);
    const cogs = getGroupNet('4.1');
    const grossProfit = netRevenue - Math.abs(cogs);

    const sellExpenses = Math.abs(getGroupNet('5.1'));
    const adminExpenses = Math.abs(getGroupNet('5.2'));
    const personnelExpenses = Math.abs(getGroupNet('5.3'));
    const generalExpenses = Math.abs(getGroupNet('5.4'));
    const operationalExpenses = sellExpenses + adminExpenses + personnelExpenses + generalExpenses;

    const ebit = grossProfit - operationalExpenses;

    const financialRevenue = getGroupNet('6.1');
    const financialExpenses = Math.abs(getGroupNet('6.2'));
    const financialResult = financialRevenue - financialExpenses;

    const ebt = ebit + financialResult;
    const taxes = Math.abs(getGroupNet('7.1'));
    const netIncome = ebt - taxes;

    return {
      companyId,
      period: {
        from: from.toISOString().substring(0, 10),
        to: to.toISOString().substring(0, 10),
      },
      groups,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      totalCosts: Math.round((Math.abs(revenueDeductions) + Math.abs(cogs)) * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      operationalExpenses: Math.round(operationalExpenses * 100) / 100,
      ebit: Math.round(ebit * 100) / 100,
      financialResult: Math.round(financialResult * 100) / 100,
      ebt: Math.round(ebt * 100) / 100,
      taxes: Math.round(taxes * 100) / 100,
      netIncome: Math.round(netIncome * 100) / 100,
      generatedAt: new Date().toISOString(),
    };
  }

  async getBalanceSummary(companyId: string) {
    const [total, pending, approved] = await Promise.all([
      this.prisma.transaction.count({ where: { companyId } }),
      this.prisma.transaction.count({ where: { companyId, status: 'draft' } }),
      this.prisma.transaction.count({ where: { companyId, status: 'approved' } }),
    ]);
    const totals = await this.prisma.transaction.aggregate({
      where: { companyId, status: 'approved' },
      _sum: { totalDebit: true, totalCredit: true },
    });
    return {
      total,
      pending,
      approved,
      totalDebit: totals._sum.totalDebit ?? 0,
      totalCredit: totals._sum.totalCredit ?? 0,
    };
  }
}
