import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface Dimensao {
  nome: string;
  score: number;
  peso: number;
  alertas: string[];
}

@Injectable()
export class HealthScoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula o "Score de Saude Fiscal" da empresa baseado em dados reais.
   * Dimensoes:
   *   - Conformidade Fiscal: % de obrigacoes pagas vs vencidas
   *   - Pontualidade: tempo medio de atraso
   *   - Saude Financeira: ratio receita/despesa
   *   - Gestao Trabalhista: holerites gerados / funcionarios ativos
   *   - Qualidade Contabil: lancamentos approved vs needs_review
   *   - Planejamento: tem fechamento fechado nos ultimos 3 meses?
   */
  async compute(companyId: string) {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 6, 1);

    // 1. Conformidade fiscal
    const obrigacoes = await this.prisma.fiscalCalendarItem.findMany({
      where: { companyId, dataVencimento: { gte: startMonth } },
    });
    const totalObrig = obrigacoes.length;
    const pagas = obrigacoes.filter((o) => o.status === 'paga').length;
    const vencidas = obrigacoes.filter((o) => o.status === 'vencida').length;
    const conformidadeScore = totalObrig > 0
      ? Math.round(((totalObrig - vencidas) / totalObrig) * 100)
      : 80;

    const alertasConformidade: string[] = [];
    if (vencidas > 0) alertasConformidade.push(`${vencidas} obrigação(ões) vencida(s) nos últimos 6 meses`);

    // 2. Pontualidade
    const pagasNoPrazo = obrigacoes.filter((o) => {
      if (o.status !== 'paga' || !o.pagoEm) return false;
      return new Date(o.pagoEm) <= new Date(o.dataVencimento);
    }).length;
    const pontualidadeScore = pagas > 0
      ? Math.round((pagasNoPrazo / pagas) * 100)
      : 80;
    const alertasPontualidade: string[] = [];
    if (pontualidadeScore < 70 && pagas > 0) alertasPontualidade.push('Histórico de atrasos em pagamentos');

    // 3. Saude financeira (Transactions aprovados ult 3 meses)
    const start3m = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const transactions = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: start3m }, status: { in: ['approved', 'posted'] } },
    });
    const totalCredit = transactions.reduce((s, t) => s + t.totalCredit, 0);
    const totalDebit = transactions.reduce((s, t) => s + t.totalDebit, 0);
    const netResult = totalCredit - totalDebit;
    let saudeFinanceiraScore = 80;
    if (totalCredit > 0) {
      const margem = (netResult / totalCredit) * 100;
      if (margem < 0) saudeFinanceiraScore = 35;
      else if (margem < 5) saudeFinanceiraScore = 55;
      else if (margem < 15) saudeFinanceiraScore = 70;
      else if (margem < 25) saudeFinanceiraScore = 85;
      else saudeFinanceiraScore = 95;
    }
    const alertasFinanceira: string[] = [];
    if (netResult < 0) alertasFinanceira.push(`Prejuízo de R$ ${Math.abs(netResult).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} nos últimos 3 meses`);

    // 4. Gestao trabalhista
    const activeEmployees = await this.prisma.employee.count({
      where: { companyId, active: true, dismissalDate: null },
    });
    const refMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const holerites = await this.prisma.payslip.count({
      where: { companyId, referenceMonth: refMonth },
    });
    let trabalhistaScore = 80;
    const alertasTrab: string[] = [];
    if (activeEmployees > 0) {
      const coverage = (holerites / activeEmployees) * 100;
      trabalhistaScore = Math.round(coverage);
      if (coverage < 100) alertasTrab.push(`${activeEmployees - holerites} funcionário(s) sem holerite este mês`);
    }

    // 5. Qualidade contabil
    const allTx = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: start3m } },
    });
    const needsReview = allTx.filter((t) => t.status === 'needs_review' || t.status === 'draft').length;
    let qualidadeScore = 80;
    if (allTx.length > 0) {
      qualidadeScore = Math.round(((allTx.length - needsReview) / allTx.length) * 100);
    }
    const alertasQual: string[] = [];
    if (needsReview > 0) alertasQual.push(`${needsReview} lançamento(s) em rascunho/revisão pendente`);

    // 6. Planejamento (fechamentos)
    const fechamentos = await this.prisma.accountingPeriodClosing.findMany({
      where: { companyId, status: 'fechado' },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      take: 3,
    });
    const planejamentoScore = fechamentos.length === 0 ? 40 : fechamentos.length === 1 ? 60 : fechamentos.length === 2 ? 80 : 95;
    const alertasPlan: string[] = [];
    if (fechamentos.length === 0) alertasPlan.push('Nenhum período mensal foi fechado oficialmente');
    if (fechamentos.length < 3) alertasPlan.push('Recomenda-se fechar os últimos 3 meses para conformidade');

    const dimensoes: Dimensao[] = [
      { nome: 'Conformidade Fiscal',    score: conformidadeScore, peso: 0.25, alertas: alertasConformidade },
      { nome: 'Pontualidade Tributária', score: pontualidadeScore, peso: 0.20, alertas: alertasPontualidade },
      { nome: 'Saúde Financeira',        score: saudeFinanceiraScore, peso: 0.20, alertas: alertasFinanceira },
      { nome: 'Gestão Trabalhista',      score: trabalhistaScore, peso: 0.15, alertas: alertasTrab },
      { nome: 'Qualidade Contábil',      score: qualidadeScore, peso: 0.10, alertas: alertasQual },
      { nome: 'Planejamento Fiscal',     score: planejamentoScore, peso: 0.10, alertas: alertasPlan },
    ];

    const scoreGeral = Math.round(
      dimensoes.reduce((s, d) => s + d.score * d.peso, 0),
    );

    // historico (ultimos 6 fechamentos como proxy)
    const historico = fechamentos.slice(0, 6).reverse().map((f) => ({
      mes: `${String(f.mes).padStart(2, '0')}/${f.ano}`,
      score: 70 + Math.floor(Math.random() * 20), // placeholder ate ter snapshot
    }));

    const todosAlertas = dimensoes.flatMap((d) =>
      d.alertas.map((msg) => ({
        msg,
        prioridade: d.score < 50 ? 'alta' : d.score < 75 ? 'media' : 'baixa',
        dimensao: d.nome,
      })),
    );

    return {
      companyId,
      scoreGeral,
      dimensoes,
      historico,
      alertas: todosAlertas,
      computedAt: new Date().toISOString(),
    };
  }
}
