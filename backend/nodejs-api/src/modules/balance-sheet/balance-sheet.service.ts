import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface AccountBalance {
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  saldo: number;
}

interface BalanceGroup {
  codigo: string;
  nome: string;
  contas: AccountBalance[];
  total: number;
}

/**
 * Balanço Patrimonial conforme NBC TG 26 / Lei 6.404.
 * Agrupa saldos contábeis da árvore PCASP a partir das Transactions aprovadas
 * até a data de corte.
 *
 * Saldo de uma conta:
 *   - natureza 'devedora' (ativo, despesa): debit - credit
 *   - natureza 'credora' (passivo, patrimônio, receita): credit - debit
 */
@Injectable()
export class BalanceSheetService {
  constructor(private prisma: PrismaService) {}

  async compute(companyId: string, asOf?: Date) {
    if (!companyId) throw new NotFoundException('companyId obrigatório');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const cutoff = asOf ?? new Date();

    const [accounts, transactions] = await Promise.all([
      this.prisma.chartAccount.findMany({
        where: { companyId, active: true },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.transaction.findMany({
        where: {
          companyId,
          date: { lte: cutoff },
          status: { in: ['approved', 'aprovado', 'paid'] },
        },
        select: { entries: true, totalDebit: true, totalCredit: true },
      }),
    ]);

    const balanceByCode = new Map<string, { debit: number; credit: number }>();

    for (const tx of transactions) {
      let parsed: any[] = [];
      try {
        parsed = JSON.parse(tx.entries);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const e of parsed) {
        const code = String(e.accountCode || e.account || '').trim();
        if (!code) continue;
        const val = Number(e.value || e.valor || 0);
        const nature = String(e.nature || e.natureza || '').toLowerCase();
        const current = balanceByCode.get(code) ?? { debit: 0, credit: 0 };
        if (nature === 'debit' || nature === 'debito' || nature === 'devedora') {
          current.debit += val;
        } else if (nature === 'credit' || nature === 'credito' || nature === 'credora') {
          current.credit += val;
        }
        balanceByCode.set(code, current);
      }
    }

    const enriched: AccountBalance[] = accounts
      .filter(a => ['ativo', 'passivo', 'patrimonio'].includes(a.tipo))
      .map(a => {
        const b = balanceByCode.get(a.codigo) ?? { debit: 0, credit: 0 };
        const saldo = a.natureza === 'devedora' ? b.debit - b.credit : b.credit - b.debit;
        return { codigo: a.codigo, nome: a.nome, tipo: a.tipo, natureza: a.natureza, saldo };
      })
      .filter(a => Math.abs(a.saldo) > 0.005);

    const groups: Record<string, BalanceGroup> = {
      ativoCirculante: { codigo: '1.1', nome: 'Ativo Circulante', contas: [], total: 0 },
      ativoNaoCirculante: { codigo: '1.2', nome: 'Ativo Não Circulante', contas: [], total: 0 },
      passivoCirculante: { codigo: '2.1', nome: 'Passivo Circulante', contas: [], total: 0 },
      passivoNaoCirculante: { codigo: '2.2', nome: 'Passivo Não Circulante', contas: [], total: 0 },
      patrimonioLiquido: { codigo: '2.3', nome: 'Patrimônio Líquido', contas: [], total: 0 },
    };

    for (const c of enriched) {
      const g = classify(c.codigo);
      if (!g) continue;
      groups[g].contas.push(c);
      groups[g].total += c.saldo;
    }

    // Resultado do exercício (receita − despesa) compõe o PL, conforme
    // NBC TG 26 — o lucro/prejuízo apurado entra no Patrimônio Líquido.
    let receita = 0, despesa = 0;
    for (const a of accounts) {
      if (a.tipo !== 'receita' && a.tipo !== 'despesa') continue;
      const b = balanceByCode.get(a.codigo) ?? { debit: 0, credit: 0 };
      if (a.tipo === 'receita') receita += b.credit - b.debit;
      else despesa += b.debit - b.credit;
    }
    const resultadoExercicio = round(receita - despesa);
    if (Math.abs(resultadoExercicio) > 0.005) {
      groups.patrimonioLiquido.contas.push({
        codigo: '2.3.09.001', nome: 'Resultado do Exercício', tipo: 'patrimonio',
        natureza: 'credora', saldo: resultadoExercicio,
      });
      groups.patrimonioLiquido.total += resultadoExercicio;
    }

    const totalAtivo = groups.ativoCirculante.total + groups.ativoNaoCirculante.total;
    const totalPassivo = groups.passivoCirculante.total + groups.passivoNaoCirculante.total;
    const totalPatrimonio = groups.patrimonioLiquido.total;
    const totalPassivoEPatrimonio = totalPassivo + totalPatrimonio;
    const diferenca = totalAtivo - totalPassivoEPatrimonio;

    return {
      companyId,
      companyName: company.name,
      asOf: cutoff.toISOString(),
      grupos: groups,
      totalAtivo: round(totalAtivo),
      totalPassivo: round(totalPassivo),
      totalPatrimonioLiquido: round(totalPatrimonio),
      totalPassivoEPatrimonio: round(totalPassivoEPatrimonio),
      diferenca: round(diferenca),
      balanceado: Math.abs(diferenca) < 0.01,
      observacao: Math.abs(diferenca) >= 0.01
        ? 'Balanço não fecha — verifique lançamentos não balanceados ou contas não classificadas no PCASP.'
        : 'Balanço Patrimonial conforme NBC TG 26 / Lei 6.404.',
    };
  }

  /** Métricas patrimoniais derivadas pra benchmark + saúde financeira. */
  async getMetrics(companyId: string, asOf?: Date) {
    const bs = await this.compute(companyId, asOf);
    const ativoCirc = bs.grupos.ativoCirculante.total;
    const passivoCirc = bs.grupos.passivoCirculante.total;
    const totalAtivo = bs.totalAtivo;
    const totalPassivo = bs.totalPassivo;
    const totalPL = bs.totalPatrimonioLiquido;

    return {
      liquidezCorrente: passivoCirc > 0 ? round(ativoCirc / passivoCirc, 2) : null,
      endividamento: totalAtivo > 0 ? round((totalPassivo / totalAtivo) * 100) : null,
      patrimonioLiquido: totalPL,
      asOf: bs.asOf,
      balanceado: bs.balanceado,
    };
  }
}

function classify(codigo: string): keyof Record<string, BalanceGroup> | null {
  if (codigo.startsWith('1.1')) return 'ativoCirculante';
  if (codigo.startsWith('1.2')) return 'ativoNaoCirculante';
  if (codigo.startsWith('2.1')) return 'passivoCirculante';
  if (codigo.startsWith('2.2')) return 'passivoNaoCirculante';
  if (codigo.startsWith('2.3')) return 'patrimonioLiquido';
  return null;
}

function round(n: number, decimals = 1) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
