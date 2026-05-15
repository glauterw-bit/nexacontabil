import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

/**
 * Gera o "Pacote Mensal" do cliente — resumo executivo em 1 página
 * para enviar via portal/e-mail/WhatsApp.
 *
 * Não emite PDF físico aqui — devolve JSON estruturado que o frontend
 * renderiza e que pode ser convertido em PDF via puppeteer/print CSS.
 */
@Injectable()
export class MonthlyPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async generate(companyId: string, ano: number, mes: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Empresa nao encontrada');

    const monthStart = new Date(ano, mes - 1, 1);
    const monthEnd = new Date(ano, mes, 0, 23, 59, 59);
    const refMonth = `${ano}-${String(mes).padStart(2, '0')}`;

    // 1) Resumo financeiro do periodo (Transactions)
    const transactions = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
        status: { in: ['approved', 'posted'] },
      },
    });
    const totalCredit = transactions.reduce((s, t) => s + t.totalCredit, 0);
    const totalDebit = transactions.reduce((s, t) => s + t.totalDebit, 0);
    const netResult = totalCredit - totalDebit;

    // 2) Documentos processados
    const docs = await this.prisma.document.count({
      where: { companyId, createdAt: { gte: monthStart, lte: monthEnd } },
    });

    // 3) Folha
    const payslips = await this.prisma.payslip.findMany({
      where: { companyId, referenceMonth: refMonth },
    });
    const folhaGross = payslips.reduce((s, p) => s + p.grossSalary, 0);
    const folhaNet = payslips.reduce((s, p) => s + p.netSalary, 0);
    const folhaInss = payslips.reduce((s, p) => s + p.inssEmployee + p.inssEmployer, 0);
    const folhaFgts = payslips.reduce((s, p) => s + p.fgts, 0);

    // 4) Obrigacoes do periodo
    const obrigacoes = await this.prisma.fiscalCalendarItem.findMany({
      where: {
        companyId,
        dataVencimento: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { dataVencimento: 'asc' },
    });
    const obrigacoesPagas = obrigacoes.filter((o) => o.status === 'paga');
    const obrigacoesPendentes = obrigacoes.filter((o) => o.status !== 'paga' && o.status !== 'isenta');
    const valorObrigacoes = obrigacoes.reduce((s, o) => s + (o.valorPago ?? o.valorEstimado ?? 0), 0);

    // 5) Bancos
    const bankConnections = await this.prisma.bankConnection.findMany({
      where: { companyId },
      include: { statements: { where: { date: { gte: monthStart, lte: monthEnd } } } },
    });
    const bankActivity = bankConnections.reduce(
      (acc, c) => {
        acc.credits += c.statements.filter((s) => s.amount > 0).reduce((sum, s) => sum + s.amount, 0);
        acc.debits += c.statements.filter((s) => s.amount < 0).reduce((sum, s) => sum + Math.abs(s.amount), 0);
        return acc;
      },
      { credits: 0, debits: 0 },
    );

    // 6) Proximas obrigacoes (30 dias seguintes)
    const next30 = new Date(monthEnd);
    next30.setDate(next30.getDate() + 30);
    const proximas = await this.prisma.fiscalCalendarItem.findMany({
      where: {
        companyId,
        dataVencimento: { gt: monthEnd, lte: next30 },
        status: { in: ['pendente', 'em_apuracao', 'apurada'] },
      },
      orderBy: { dataVencimento: 'asc' },
      take: 5,
    });

    // 7) Executive summary via Claude
    const summary = await this.generateSummary({
      companyName: company.name,
      taxRegime: company.taxRegime,
      monthLabel: new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      netResult,
      totalCredit,
      totalDebit,
      folhaGross,
      folhaNet,
      obrigacoesPagas: obrigacoesPagas.length,
      obrigacoesPendentes: obrigacoesPendentes.length,
      docs,
      bankCredits: bankActivity.credits,
      bankDebits: bankActivity.debits,
    });

    return {
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        taxRegime: company.taxRegime,
      },
      period: {
        ano,
        mes,
        from: monthStart.toISOString(),
        to: monthEnd.toISOString(),
        label: new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      },
      executiveSummary: summary,
      financeiro: {
        totalCredit,
        totalDebit,
        netResult,
        bankCredits: bankActivity.credits,
        bankDebits: bankActivity.debits,
        bankNet: bankActivity.credits - bankActivity.debits,
      },
      operacao: {
        documentosProcessados: docs,
        transacoesLancadas: transactions.length,
      },
      folha: {
        funcionarios: payslips.length,
        salarioBrutoTotal: folhaGross,
        salarioLiquidoTotal: folhaNet,
        inss: folhaInss,
        fgts: folhaFgts,
      },
      obrigacoes: {
        pagas: obrigacoesPagas.length,
        pendentes: obrigacoesPendentes.length,
        valorTotal: valorObrigacoes,
        detalhe: obrigacoes.map((o) => ({
          tipo: o.tipo,
          descricao: o.descricao,
          vencimento: o.dataVencimento,
          status: o.status,
          valorPago: o.valorPago,
        })),
      },
      proximasObrigacoes: proximas.map((o) => ({
        tipo: o.tipo,
        descricao: o.descricao,
        vencimento: o.dataVencimento,
        valorEstimado: o.valorEstimado,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async generateSummary(d: any): Promise<string> {
    const prompt = `Voce e um especialista em contabilidade brasileira. Escreva um resumo executivo CURTO (4-6 frases, máximo 600 caracteres) do mês para o cliente final do escritório contábil. Tom direto, em portugues, sem usar emojis ou markdown.

Dados:
- Empresa: ${d.companyName} (${d.taxRegime})
- Mês: ${d.monthLabel}
- Resultado contábil: ${d.netResult >= 0 ? 'lucro' : 'prejuizo'} de R$ ${Math.abs(d.netResult).toLocaleString('pt-BR')}
- Receitas: R$ ${d.totalCredit.toLocaleString('pt-BR')}
- Despesas: R$ ${d.totalDebit.toLocaleString('pt-BR')}
- Folha bruta: R$ ${d.folhaGross.toLocaleString('pt-BR')}
- Obrigacoes pagas: ${d.obrigacoesPagas} / Pendentes: ${d.obrigacoesPendentes}
- Movimentacao bancaria: entradas R$ ${d.bankCredits.toLocaleString('pt-BR')}, saidas R$ ${d.bankDebits.toLocaleString('pt-BR')}
- Documentos processados: ${d.docs}

Mencione: situacao geral, ponto de atencao se houver, e oque vem no proximo mes.`;

    try {
      const text = await this.ai.chat(prompt);
      return text.slice(0, 700);
    } catch {
      return this.fallbackSummary(d);
    }
  }

  private fallbackSummary(d: any): string {
    const sit = d.netResult >= 0 ? 'lucro' : 'prejuizo';
    const valor = `R$ ${Math.abs(d.netResult).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const obrigStatus = d.obrigacoesPendentes === 0 ? 'todas em dia' : `${d.obrigacoesPendentes} pendente(s)`;
    return `Em ${d.monthLabel}, ${d.companyName} fechou com ${sit} de ${valor}. Receitas: R$ ${d.totalCredit.toLocaleString('pt-BR')}, despesas R$ ${d.totalDebit.toLocaleString('pt-BR')}. Folha de pagamento bruta: R$ ${d.folhaGross.toLocaleString('pt-BR')}. Obrigações fiscais: ${obrigStatus}.`;
  }
}
