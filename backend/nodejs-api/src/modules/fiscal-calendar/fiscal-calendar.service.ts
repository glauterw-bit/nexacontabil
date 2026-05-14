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
   * Usa as datas oficiais médias (DAS dia 20, FGTS dia 7, ISS dia 10/15/20 conforme município, etc).
   * O contador ajusta depois caso necessário (ISS varia por município).
   */
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
        descricao: 'GFIP / FGTS - competencia ' + competencia,
        competencia,
        dataVencimento: new Date(vencAno, vencMes - 1, 7),
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
          descricao: 'DAS Simples Nacional - competencia ' + competencia,
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
          descricao: 'DCTFWeb - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 15),
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
