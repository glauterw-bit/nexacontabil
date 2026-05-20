import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

export interface MalhaFinaRisk {
  score: number; // 0-100
  level: 'baixo' | 'medio' | 'alto' | 'critico';
  fatores: Array<{ fator: string; impacto: number; explicacao: string }>;
  recomendacoes: string[];
  resumoIA?: string;
  computedAt: string;
}

export interface FolhaAnomaly {
  employeeId: string;
  employeeName: string;
  tipo: 'salario_atipico' | 'hora_extra_alta' | 'descontos_atipicos' | 'variacao_brusca' | 'novo_funcionario_alto_salario';
  severidade: 'baixa' | 'media' | 'alta';
  detalhe: string;
  valoresReferencia?: { current: number; reference: number; diff_pct: number };
}

@Injectable()
export class PredictiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Predicao de risco de malha fina baseada em sinais reais da escrituração.
   * Pesos heurísticos somam ate 100. Claude opcionalmente refina com
   * resumo executivo (cai em fallback se sem ANTHROPIC_API_KEY).
   */
  async predictMalhaFina(companyId: string): Promise<MalhaFinaRisk> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Empresa não encontrada');

    const now = new Date();
    const start12m = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const fatores: MalhaFinaRisk['fatores'] = [];
    let score = 0;

    // F1: Documentos pendentes/falhos (max 15 pts)
    const docs = await this.prisma.document.findMany({
      where: { companyId, createdAt: { gte: start12m } },
    });
    const docsNeedsReview = docs.filter((d) => d.status === 'needs_review' || d.status === 'failed').length;
    const f1 = Math.min(15, Math.floor((docsNeedsReview / Math.max(docs.length, 1)) * 30));
    if (f1 > 0) {
      fatores.push({
        fator: 'Documentos com inconsistência',
        impacto: f1,
        explicacao: `${docsNeedsReview} de ${docs.length} documento(s) precisam de revisão`,
      });
      score += f1;
    }

    // F2: Obrigacoes vencidas no ano (max 20 pts)
    const obrig = await this.prisma.fiscalCalendarItem.findMany({
      where: { companyId, dataVencimento: { gte: start12m } },
    });
    const vencidas = obrig.filter((o) => o.status === 'vencida').length;
    const f2 = Math.min(20, vencidas * 4);
    if (f2 > 0) {
      fatores.push({
        fator: 'Obrigações fiscais vencidas',
        impacto: f2,
        explicacao: `${vencidas} obrigação(ões) ainda não regularizada(s) — gera CADIN e malha`,
      });
      score += f2;
    }

    // F3: Transactions em rascunho ou sem balance (max 15 pts)
    const tx = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: start12m } },
    });
    const desbalanced = tx.filter((t) => !t.isBalanced || t.status === 'draft').length;
    const f3 = Math.min(15, Math.floor((desbalanced / Math.max(tx.length, 1)) * 30));
    if (f3 > 0) {
      fatores.push({
        fator: 'Lançamentos contábeis com problema',
        impacto: f3,
        explicacao: `${desbalanced} de ${tx.length} lançamentos desbalanceados ou em rascunho`,
      });
      score += f3;
    }

    // F4: Certidoes positivas ou expiradas (max 15 pts)
    const certs = await this.prisma.certidao.findMany({
      where: { companyId },
      orderBy: { dataEmissao: 'desc' },
      take: 6,
    });
    const certsRuins = certs.filter((c) => c.status === 'positiva' ||
      (c.dataValidade && new Date(c.dataValidade) < now)).length;
    const f4 = Math.min(15, certsRuins * 5);
    if (f4 > 0) {
      fatores.push({
        fator: 'Certidões positivas ou vencidas',
        impacto: f4,
        explicacao: `${certsRuins} certidão(ões) com pendência`,
      });
      score += f4;
    }

    // F5: Falta de fechamento mensal (max 15 pts)
    const fechamentos = await this.prisma.accountingPeriodClosing.findMany({
      where: { companyId, status: 'fechado' },
    });
    const mesesEsperados = 6;
    const fechados = fechamentos.length;
    const f5 = fechados >= mesesEsperados ? 0 : Math.min(15, (mesesEsperados - fechados) * 3);
    if (f5 > 0) {
      fatores.push({
        fator: 'Períodos contábeis não fechados',
        impacto: f5,
        explicacao: `Apenas ${fechados} fechamento(s) oficial(is); sem rastreabilidade plena`,
      });
      score += f5;
    }

    // F6: Receita vs despesa zerada ou negativa por meses consecutivos (max 10 pts)
    const tx3m = await this.prisma.transaction.findMany({
      where: {
        companyId,
        date: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
        status: { in: ['approved', 'posted'] },
      },
    });
    const totalCredit = tx3m.reduce((s, t) => s + t.totalCredit, 0);
    const totalDebit = tx3m.reduce((s, t) => s + t.totalDebit, 0);
    let f6 = 0;
    if (totalCredit > 0 && totalDebit > totalCredit * 1.3) {
      f6 = 10;
      fatores.push({
        fator: 'Despesa muito superior à receita',
        impacto: f6,
        explicacao: `Despesa últimos 3 meses 30%+ acima da receita — bandeira para fiscalização`,
      });
      score += f6;
    }

    // F7: Folha vs receita (max 10 pts) — proxy para informalidade
    const now2 = new Date();
    const refMonth = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
    const payslips = await this.prisma.payslip.findMany({ where: { companyId, referenceMonth: refMonth } });
    const folhaBruta = payslips.reduce((s, p) => s + p.grossSalary, 0);
    let f7 = 0;
    if (totalCredit > 0 && folhaBruta > 0) {
      const ratio = folhaBruta / (totalCredit / 3);
      if (ratio > 0.5) {
        f7 = Math.min(10, Math.floor((ratio - 0.5) * 20));
        fatores.push({
          fator: 'Folha muito alta proporcional à receita',
          impacto: f7,
          explicacao: `Folha mensal R$ ${folhaBruta.toLocaleString('pt-BR')} vs receita média mensal — atenção a Lucro Presumido`,
        });
        score += f7;
      }
    }

    const level: MalhaFinaRisk['level'] =
      score >= 70 ? 'critico'
      : score >= 50 ? 'alto'
      : score >= 25 ? 'medio'
      : 'baixo';

    const recomendacoes: string[] = [];
    if (vencidas > 0) recomendacoes.push('Regularizar obrigações vencidas via parcelamento ou pagamento imediato');
    if (docsNeedsReview > 0) recomendacoes.push('Revisar documentos pendentes na fila de IA');
    if (certsRuins > 0) recomendacoes.push('Emitir novas certidões negativas ou regularizar pendências');
    if (fechados < mesesEsperados) recomendacoes.push('Fechar formalmente os últimos meses para gerar trilha de auditoria');
    if (recomendacoes.length === 0) recomendacoes.push('Manter rotina atual — risco baixo de malha fina');

    // Resumo via Claude (opcional)
    let resumoIA: string | undefined;
    try {
      const prompt = `Voce e auditor fiscal. Empresa ${company.name} (${company.taxRegime}) tem score de risco de malha fina ${score}/100 (${level}). Fatores: ${JSON.stringify(fatores.map(f => ({ f: f.fator, i: f.impacto })))}. Em 2-3 frases (max 400 chars), explique objetivamente o risco para o contador e o cliente. Sem emoji.`;
      const r = await this.ai.chat(prompt);
      if (r && r.length < 600 && !r.includes('Configure ANTHROPIC')) {
        resumoIA = r;
      }
    } catch {}

    return {
      score,
      level,
      fatores,
      recomendacoes,
      resumoIA,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Detecta anomalias estatisticas na folha do mes vs media historica.
   */
  async detectFolhaAnomalies(companyId: string, refMonth?: string): Promise<FolhaAnomaly[]> {
    const now = new Date();
    const ref = refMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const employees = await this.prisma.employee.findMany({
      where: { companyId, active: true },
    });
    const anomalies: FolhaAnomaly[] = [];

    for (const emp of employees) {
      const allPayslips = await this.prisma.payslip.findMany({
        where: { companyId, employeeId: emp.id },
        orderBy: { referenceMonth: 'desc' },
        take: 13,
      });
      const current = allPayslips.find((p) => p.referenceMonth === ref);
      if (!current) {
        // Funcionario ativo sem holerite no mes (anomalia P-Q.1)
        anomalies.push({
          employeeId: emp.id,
          employeeName: emp.name,
          tipo: 'novo_funcionario_alto_salario',
          severidade: 'media',
          detalhe: `Funcionário ativo sem holerite gerado em ${ref}`,
        });
        continue;
      }

      const historicos = allPayslips.filter((p) => p.referenceMonth !== ref);
      if (historicos.length < 3) continue; // sem base estatistica

      // Anomalia 1: salário bruto fora do padrão histórico (>30% variação)
      const meanGross = historicos.reduce((s, p) => s + p.grossSalary, 0) / historicos.length;
      const diffPct = ((current.grossSalary - meanGross) / meanGross) * 100;
      if (Math.abs(diffPct) > 30) {
        anomalies.push({
          employeeId: emp.id,
          employeeName: emp.name,
          tipo: 'salario_atipico',
          severidade: Math.abs(diffPct) > 50 ? 'alta' : 'media',
          detalhe: `Salário bruto ${diffPct > 0 ? 'aumentou' : 'caiu'} ${Math.abs(diffPct).toFixed(1)}% vs média histórica`,
          valoresReferencia: { current: current.grossSalary, reference: meanGross, diff_pct: diffPct },
        });
      }

      // Anomalia 2: hora extra muito alta (>20% do bruto)
      if (current.overtimeValue > current.grossSalary * 0.2) {
        anomalies.push({
          employeeId: emp.id,
          employeeName: emp.name,
          tipo: 'hora_extra_alta',
          severidade: 'media',
          detalhe: `Hora extra de R$ ${current.overtimeValue.toLocaleString('pt-BR')} representa ${((current.overtimeValue / current.grossSalary) * 100).toFixed(0)}% do bruto`,
          valoresReferencia: { current: current.overtimeValue, reference: current.grossSalary * 0.1, diff_pct: 0 },
        });
      }

      // Anomalia 3: descontos > 50% do bruto
      const descontos = current.inssEmployee + current.irrf + current.otherDeductions;
      if (descontos > current.grossSalary * 0.5) {
        anomalies.push({
          employeeId: emp.id,
          employeeName: emp.name,
          tipo: 'descontos_atipicos',
          severidade: 'alta',
          detalhe: `Descontos totais de R$ ${descontos.toLocaleString('pt-BR')} ultrapassam 50% do bruto`,
        });
      }
    }

    return anomalies;
  }
}
