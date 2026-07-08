import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FiscalCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCompany(companyId: string, params: { status?: string; from?: string; to?: string } = {}) {
    const where: any = { companyId };
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.dataVencimento = {};
      if (params.from) where.dataVencimento.gte = new Date(params.from);
      if (params.to) where.dataVencimento.lte = new Date(params.to);
    }
    return this.prisma.fiscalCalendarItem.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async upcoming(companyId: string, daysAhead = 30) {
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + daysAhead);
    return this.prisma.fiscalCalendarItem.findMany({
      where: {
        companyId,
        status: { in: ['pendente', 'em_apuracao', 'apurada'] },
        dataVencimento: { gte: now, lte: limit },
      },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async create(data: any) {
    return this.prisma.fiscalCalendarItem.create({
      data: {
        ...data,
        dataVencimento: new Date(data.dataVencimento),
      },
    });
  }

  async update(id: string, patch: any) {
    const found = await this.prisma.fiscalCalendarItem.findUnique({ where: { id } });
    if (!found) throw new NotFoundException();
    const data: any = { ...patch };
    if (patch.dataVencimento) data.dataVencimento = new Date(patch.dataVencimento);
    if (patch.pagoEm) data.pagoEm = new Date(patch.pagoEm);
    return this.prisma.fiscalCalendarItem.update({ where: { id }, data });
  }

  async marcarPaga(id: string, valorPago: number, comprovanteUrl?: string) {
    return this.prisma.fiscalCalendarItem.update({
      where: { id },
      data: { status: 'paga', valorPago, comprovanteUrl, pagoEm: new Date() },
    });
  }

  /**
   * Gera obrigações fiscais recorrentes do ano para uma empresa, baseado no regime.
   * Datas 2026: DAS/PGDAS dia 20 · FGTS Digital dia 20 · DCTFWeb+MIT último dia útil · Reinf dia 15.
   * O contador ajusta depois caso necessário (ISS varia por município).
   */
  /** Último dia ÚTIL do mês (sábado/domingo recuam p/ sexta) — regra DCTFWeb desde 2025. */
  private ultimoDiaUtil(ano: number, mesIndex0: number): Date {
    const d = new Date(ano, mesIndex0 + 1, 0); // último dia do mês
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }

  async gerarAnual(companyId: string, ano: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa nao encontrada');

    const regime = (company.taxRegime || '').toUpperCase();
    const itens: Array<{
      tipo: string;
      descricao: string;
      competencia: string;
      dataVencimento: Date;
      recorrencia: string;
      prioridade?: string;
    }> = [];

    for (let mes = 1; mes <= 12; mes++) {
      const compMes = String(mes).padStart(2, '0');
      const competencia = `${ano}-${compMes}`;
      // Mês de competência se refere ao mês anterior; obrigações vencem no mês seguinte
      const vencMes = mes === 12 ? 1 : mes + 1;
      const vencAno = mes === 12 ? ano + 1 : ano;

      // Comuns a todos os regimes
      itens.push({
        tipo: 'FGTS',
        descricao: 'FGTS Digital (Pix, guia no portal MTE) - competencia ' + competencia,
        competencia,
        dataVencimento: new Date(vencAno, vencMes - 1, 20), // dia 20 desde o FGTS Digital (mar/2024)
        recorrencia: 'mensal',
        prioridade: 'alta',
      });
      itens.push({
        tipo: 'ESOCIAL',
        descricao: 'eSocial - envio mensal eventos S-1200/S-1210 - ' + competencia,
        competencia,
        dataVencimento: new Date(vencAno, vencMes - 1, 15),
        recorrencia: 'mensal',
        prioridade: 'alta',
      });

      // Por regime tributário
      if (regime === 'SIMPLES_NACIONAL' || regime === 'SIMPLES') {
        itens.push({
          tipo: 'DAS',
          descricao: 'DAS + PGDAS-D - competencia ' + competencia + ' (atraso na declaracao = multa 2%/mes desde 2026)',
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 20),
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
      } else if (regime === 'MEI') {
        itens.push({
          tipo: 'DAS',
          descricao: 'DAS-SIMEI MEI - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 20),
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
      } else if (regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO' || regime === 'LUCRO_REAL' || regime === 'REAL') {
        // PIS
        itens.push({
          tipo: 'DARF',
          descricao: 'DARF PIS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 25),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // COFINS
        itens.push({
          tipo: 'DARF',
          descricao: 'DARF COFINS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 25),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // ICMS estadual
        itens.push({
          tipo: 'ICMS',
          descricao: 'GIA ICMS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 15),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // DCTFWeb mensal
        itens.push({
          tipo: 'DCTFWeb',
          descricao: 'DCTFWeb + MIT (IRPJ/CSLL/PIS/COFINS) - competencia ' + competencia,
          competencia,
          dataVencimento: this.ultimoDiaUtil(vencAno, vencMes - 1), // último dia útil desde a IN RFB 2.237/2024
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
        // EFD-REINF
        itens.push({
          tipo: 'EFD_REINF',
          descricao: 'EFD-REINF - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 15),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
      }
    }

    // Trimestrais (Presumido)
    if (regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO') {
      for (const tri of [1, 2, 3, 4]) {
        const ultMes = tri * 3;
        const competencia = `${ano}-T${tri}`;
        itens.push({
          tipo: 'DARF',
          descricao: `IRPJ ${tri}T${ano}`,
          competencia,
          dataVencimento: new Date(ano, ultMes, 30), // ultimo dia do mes seguinte
          recorrencia: 'trimestral',
          prioridade: 'critica',
        });
        itens.push({
          tipo: 'DARF',
          descricao: `CSLL ${tri}T${ano}`,
          competencia,
          dataVencimento: new Date(ano, ultMes, 30),
          recorrencia: 'trimestral',
          prioridade: 'critica',
        });
      }
    }

    // Anuais
    if (regime === 'SIMPLES_NACIONAL' || regime === 'SIMPLES') {
      itens.push({
        tipo: 'DEFIS',
        descricao: `DEFIS ${ano} (Simples Nacional)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 2, 31), // 31 de marco
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }
    if (regime === 'MEI') {
      itens.push({
        tipo: 'DASN-SIMEI',
        descricao: `DASN-SIMEI ${ano} (MEI)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 4, 31), // 31 de maio
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }
    if (regime === 'LUCRO_REAL' || regime === 'REAL' || regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO') {
      itens.push({
        tipo: 'ECD',
        descricao: `ECD ${ano} (SPED Contabil)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 4, 31), // 31 de maio
        recorrencia: 'anual',
        prioridade: 'critica',
      });
      itens.push({
        tipo: 'ECF',
        descricao: `ECF ${ano} (SPED Fiscal anual)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 6, 31), // 31 de julho
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }

    const data = itens.map((it) => ({
      ...it,
      companyId,
      status: 'pendente',
    }));
    await this.prisma.fiscalCalendarItem.createMany({ data });
    return { generated: data.length };
  }

  /**
   * REGERA o calendário de um ano para TODAS as empresas ativas — com as datas
   * corrigidas (FGTS dia 20, DCTFWeb último dia útil, etc). Apaga os itens do ano
   * que ainda NÃO foram pagos/entregues (preserva histórico de comprovantes) e cria
   * de novo. Ideal para aplicar as regras novas em massa.
   */
  async regenerarTodos(ano: number) {
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true },
    });
    let empresas = 0, gerados = 0, apagados = 0;
    for (const c of companies) {
      // apaga só o que está em aberto deste ano (mensais YYYY-MM e anuais YYYY / YYYY-Tn)
      const del = await this.prisma.fiscalCalendarItem.deleteMany({
        where: {
          companyId: c.id,
          competencia: { startsWith: String(ano) },
          status: { notIn: ['paga', 'isenta', 'entregue'] },
        },
      });
      apagados += del.count;
      try {
        const r = await this.gerarAnual(c.id, ano);
        gerados += r.generated;
        empresas++;
      } catch { /* empresa sem regime válido — pula */ }
    }
    return { empresas, gerados, apagadosEmAberto: apagados, ano };
  }

  /** Diariamente: marca obrigações vencidas. Pode ser chamado por cron externo. */
  async markOverdue() {
    const now = new Date();
    const result = await this.prisma.fiscalCalendarItem.updateMany({
      where: { dataVencimento: { lt: now }, status: { in: ['pendente', 'em_apuracao', 'apurada'] } },
      data: { status: 'vencida' },
    });
    return { updated: result.count };
  }
}
