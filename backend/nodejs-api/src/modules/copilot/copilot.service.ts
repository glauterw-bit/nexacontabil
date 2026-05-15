import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Responde uma pergunta do contador/cliente com CONTEXTO FISCAL REAL
   * da empresa selecionada — situacao financeira, obrigacoes proximas,
   * folha, certidoes. Diferencial enorme contra Copilot generico.
   */
  async chatWithContext(
    companyId: string | null,
    question: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  ): Promise<{ answer: string; sources: string[] }> {
    const sources: string[] = [];
    let contextBlock = '';

    if (companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (company) {
        contextBlock += `\n=== DADOS DA EMPRESA SELECIONADA ===\n`;
        contextBlock += `Razao Social: ${company.name}\n`;
        contextBlock += `CNPJ: ${company.cnpj}\n`;
        contextBlock += `Regime tributario: ${company.taxRegime}\n`;
        sources.push('Empresa');

        // Proximos vencimentos
        const proximos = await this.prisma.fiscalCalendarItem.findMany({
          where: {
            companyId,
            status: { in: ['pendente', 'em_apuracao', 'apurada'] },
            dataVencimento: { gte: new Date() },
          },
          orderBy: { dataVencimento: 'asc' },
          take: 8,
        });
        if (proximos.length > 0) {
          contextBlock += `\n=== PROXIMAS OBRIGACOES (${proximos.length}) ===\n`;
          for (const o of proximos) {
            const venc = new Date(o.dataVencimento).toLocaleDateString('pt-BR');
            contextBlock += `- ${venc} | ${o.tipo} | ${o.descricao}`;
            if (o.valorEstimado) contextBlock += ` | R$ ${o.valorEstimado.toLocaleString('pt-BR')}`;
            contextBlock += '\n';
          }
          sources.push(`Calendario fiscal (${proximos.length})`);
        }

        // Ultimos lancamentos
        const lastTransactions = await this.prisma.transaction.findMany({
          where: { companyId },
          orderBy: { date: 'desc' },
          take: 5,
        });
        if (lastTransactions.length > 0) {
          contextBlock += `\n=== ULTIMOS LANCAMENTOS (${lastTransactions.length}) ===\n`;
          for (const t of lastTransactions) {
            contextBlock += `- ${new Date(t.date).toLocaleDateString('pt-BR')} | ${t.description.slice(0, 60)} | Deb R$ ${t.totalDebit.toLocaleString('pt-BR')} | Cred R$ ${t.totalCredit.toLocaleString('pt-BR')}\n`;
          }
          sources.push(`Transactions (${lastTransactions.length})`);
        }

        // Folha do mes atual
        const now = new Date();
        const refMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const payslips = await this.prisma.payslip.findMany({
          where: { companyId, referenceMonth: refMonth },
        });
        const activeEmployees = await this.prisma.employee.count({
          where: { companyId, active: true, dismissalDate: null },
        });
        contextBlock += `\n=== FOLHA ${refMonth} ===\n`;
        contextBlock += `Funcionarios ativos: ${activeEmployees}\n`;
        contextBlock += `Holerites gerados: ${payslips.length}\n`;
        if (payslips.length > 0) {
          const gross = payslips.reduce((s, p) => s + p.grossSalary, 0);
          const fgts = payslips.reduce((s, p) => s + p.fgts, 0);
          contextBlock += `Salario bruto total: R$ ${gross.toLocaleString('pt-BR')}\n`;
          contextBlock += `FGTS a recolher: R$ ${fgts.toLocaleString('pt-BR')}\n`;
        }
        sources.push('Folha de pagamento');

        // Certidoes
        const certs = await this.prisma.certidao.findMany({
          where: { companyId },
          orderBy: { dataEmissao: 'desc' },
          take: 5,
        });
        if (certs.length > 0) {
          contextBlock += `\n=== CERTIDOES ===\n`;
          for (const c of certs) {
            const venc = c.dataValidade ? `vence ${new Date(c.dataValidade).toLocaleDateString('pt-BR')}` : 'sem validade';
            contextBlock += `- ${c.tipo} | ${c.status} | ${venc}\n`;
          }
          sources.push(`Certidoes (${certs.length})`);
        }

        // Fechamento mensal status
        const closing = await this.prisma.accountingPeriodClosing.findFirst({
          where: { companyId },
          orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
        });
        if (closing) {
          contextBlock += `\n=== ULTIMO FECHAMENTO ===\n`;
          contextBlock += `Periodo: ${String(closing.mes).padStart(2, '0')}/${closing.ano} | Status: ${closing.status}\n`;
          sources.push('Fechamento mensal');
        }
      }
    }

    const enrichedQuestion = contextBlock
      ? `${contextBlock}\n=== PERGUNTA DO USUARIO ===\n${question}\n\nResponda usando os dados acima quando relevante. Cite numeros especificos. Se a pergunta nao tem relacao com os dados, responda normalmente. Português brasileiro.`
      : question;

    const answer = await this.ai.chat(enrichedQuestion, history);
    return { answer, sources };
  }
}
