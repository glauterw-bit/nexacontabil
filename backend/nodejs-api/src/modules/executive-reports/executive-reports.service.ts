import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ExecutiveReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private _formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private _getPreviousMonth(referenceMonth: string): { year: number; month: number } {
    const [year, month] = referenceMonth.split('-').map(Number);
    if (month === 1) return { year: year - 1, month: 12 };
    return { year, month: month - 1 };
  }

  /**
   * Gera um relatório executivo consolidado do mês de referência.
   * O conteúdo é formatado para ser enviado via WhatsApp ou e-mail.
   */
  async generateExecutiveReport(companyId: string, referenceMonth: string, channel: string = 'whatsapp') {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Empresa ${companyId} não encontrada`);

    const [year, month] = referenceMonth.split('-').map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const monthName = from.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    // Coleta métricas do período
    const [
      transactions,
      pendingObligations,
      payslips,
      fiscalNotes,
      boletos,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { companyId, date: { gte: from, lte: to } },
      }),
      this.prisma.fiscalObligation.findMany({
        where: {
          companyId,
          status: 'pending',
          dueDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      this.prisma.payslip.findMany({
        where: { companyId, referenceMonth },
        include: { employee: true },
      }),
      this.prisma.fiscalNote.findMany({
        where: { companyId, issueDate: { gte: from, lte: to } },
      }),
      this.prisma.boleto.findMany({
        where: { companyId, createdAt: { gte: from, lte: to } },
      }),
    ]);

    // Calcula totais
    const approvedTx = transactions.filter(tx => tx.status === 'approved');
    const totalRevenue = approvedTx
      .filter(tx => tx.totalCredit > tx.totalDebit)
      .reduce((sum, tx) => sum + tx.totalCredit, 0);
    const totalExpenses = approvedTx
      .filter(tx => tx.totalDebit > tx.totalCredit)
      .reduce((sum, tx) => sum + tx.totalDebit, 0);
    const netResult = totalRevenue - totalExpenses;

    const totalPayroll = payslips.reduce((sum, p) => sum + p.netSalary, 0);
    const totalFiscalNotes = fiscalNotes.reduce((sum, n) => sum + n.totalValue, 0);
    const pendingBoletos = boletos.filter(b => b.status === 'pending');
    const paidBoletos = boletos.filter(b => b.status === 'paid');
    const totalBoletosReceivable = pendingBoletos.reduce((sum, b) => sum + b.amount, 0);
    const totalBoletosReceived = paidBoletos.reduce((sum, b) => sum + (b.paidAmount ?? b.amount), 0);

    // Próximas obrigações fiscais
    const obligationsText = pendingObligations.length > 0
      ? pendingObligations
          .map(o => `  • ${o.name}: ${o.dueDate.toLocaleDateString('pt-BR')}`)
          .join('\n')
      : '  • Nenhuma obrigação pendente nos próximos 30 dias';

    // Monta o conteúdo do relatório
    const isWhatsApp = channel === 'whatsapp';
    const bold = (text: string) => isWhatsApp ? `*${text}*` : `**${text}**`;
    const line = isWhatsApp ? '─────────────────────' : '---';

    const content = [
      `${bold('RELATÓRIO EXECUTIVO')}`,
      `${bold(company.name)}`,
      `Período: ${monthName}`,
      line,
      ``,
      `${bold('RESULTADO DO PERÍODO')}`,
      `Receitas: ${this._formatCurrency(totalRevenue)}`,
      `Despesas: ${this._formatCurrency(totalExpenses)}`,
      `Resultado: ${this._formatCurrency(netResult)} ${netResult >= 0 ? '✅' : '⚠️'}`,
      ``,
      `${bold('MOVIMENTAÇÃO')}`,
      `Lançamentos no período: ${transactions.length}`,
      `Aprovados: ${approvedTx.length}`,
      `Pendentes de aprovação: ${transactions.length - approvedTx.length}`,
      ``,
      `${bold('NOTAS FISCAIS')}`,
      `Emitidas: ${fiscalNotes.length}`,
      `Total faturado: ${this._formatCurrency(totalFiscalNotes)}`,
      ``,
      `${bold('BOLETOS')}`,
      `Emitidos: ${boletos.length}`,
      `Pagos: ${paidBoletos.length} (${this._formatCurrency(totalBoletosReceived)})`,
      `A receber: ${pendingBoletos.length} (${this._formatCurrency(totalBoletosReceivable)})`,
      ``,
      `${bold('FOLHA DE PAGAMENTO')}`,
      `Funcionários pagos: ${payslips.length}`,
      `Total líquido pago: ${this._formatCurrency(totalPayroll)}`,
      ``,
      `${bold('PRÓXIMAS OBRIGAÇÕES (30 dias)')}`,
      obligationsText,
      ``,
      line,
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      `NexaContabil - Contabilidade Inteligente`,
    ].join('\n');

    return this.prisma.executiveReport.create({
      data: {
        companyId,
        referenceMonth,
        content,
        status: 'generated',
        channel,
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.executiveReport.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const report = await this.prisma.executiveReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException(`Relatório executivo ${id} não encontrado`);
    return report;
  }

  async markAsSent(id: string) {
    await this.findById(id);
    return this.prisma.executiveReport.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
  }
}
