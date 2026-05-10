import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface FiscalObligationSeed {
  name: string;
  type: string;
  dueDayOfMonth: number;
  taxRegimes: string[]; // 'simples' | 'lucro_presumido' | 'lucro_real' | 'all'
  isAcessory?: boolean;
}

// Calendário fiscal brasileiro (obrigações mensais)
const MONTHLY_OBLIGATIONS: FiscalObligationSeed[] = [
  // Simples Nacional
  { name: 'DAS - Simples Nacional', type: 'das', dueDayOfMonth: 20, taxRegimes: ['simples'] },
  { name: 'DEFIS - Declaração Simples', type: 'defis', dueDayOfMonth: 31, taxRegimes: ['simples'], isAcessory: true },

  // Lucro Presumido / Real - impostos federais
  { name: 'DARF - IRPJ (estimativa)', type: 'irpj', dueDayOfMonth: 30, taxRegimes: ['lucro_presumido', 'lucro_real'] },
  { name: 'DARF - CSLL (estimativa)', type: 'csll', dueDayOfMonth: 30, taxRegimes: ['lucro_presumido', 'lucro_real'] },
  { name: 'DARF - PIS/COFINS', type: 'pis_cofins', dueDayOfMonth: 25, taxRegimes: ['lucro_presumido', 'lucro_real'] },
  { name: 'DARF - IPI', type: 'ipi', dueDayOfMonth: 25, taxRegimes: ['lucro_presumido', 'lucro_real'] },

  // Obrigações trabalhistas (todas as empresas)
  { name: 'FGTS Mensal', type: 'fgts', dueDayOfMonth: 7, taxRegimes: ['all'] },
  { name: 'GPS - INSS Empregador', type: 'inss', dueDayOfMonth: 20, taxRegimes: ['all'] },

  // ISS Municipal
  { name: 'ISS Municipal', type: 'iss', dueDayOfMonth: 15, taxRegimes: ['all'] },

  // Obrigações acessórias
  { name: 'eSocial - Eventos Periódicos', type: 'esocial', dueDayOfMonth: 7, taxRegimes: ['all'], isAcessory: true },
  { name: 'EFD-REINF', type: 'efd_reinf', dueDayOfMonth: 15, taxRegimes: ['lucro_presumido', 'lucro_real'], isAcessory: true },
  { name: 'SPED Fiscal', type: 'sped_fiscal', dueDayOfMonth: 15, taxRegimes: ['lucro_real'], isAcessory: true },
  { name: 'ECF - Escrituração Contábil', type: 'ecf', dueDayOfMonth: 31, taxRegimes: ['lucro_presumido', 'lucro_real'], isAcessory: true },
];

// Obrigações anuais
const ANNUAL_OBLIGATIONS: Array<{
  name: string; type: string; month: number; day: number;
  taxRegimes: string[];
}> = [
  { name: 'RAIS - Relação Anual de Informações Sociais', type: 'rais', month: 3, day: 31, taxRegimes: ['all'] },
  { name: 'DIRF - Declaração de IR Retido', type: 'dirf', month: 2, day: 28, taxRegimes: ['all'] },
  { name: 'DASN-SIMEI', type: 'dasn_simei', month: 5, day: 31, taxRegimes: ['simples'] },
];

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private _getLastDayOfMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  private _buildDueDate(year: number, month: number, day: number): Date {
    const lastDay = this._getLastDayOfMonth(year, month);
    const actualDay = Math.min(day, lastDay);
    return new Date(year, month, actualDay, 23, 59, 59);
  }

  async seedFiscalCalendar(companyId: string, year: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Empresa ${companyId} não encontrada`);

    const taxRegime = company.taxRegime.toLowerCase().replace(' ', '_');
    const created: any[] = [];

    // Obrigações mensais (12 meses)
    for (let month = 0; month < 12; month++) {
      const referenceMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
      const monthName = new Date(year, month, 1).toLocaleString('pt-BR', { month: 'long' });

      for (const obligation of MONTHLY_OBLIGATIONS) {
        const applies =
          obligation.taxRegimes.includes('all') ||
          obligation.taxRegimes.includes(taxRegime);
        if (!applies) continue;

        const dueDate = this._buildDueDate(year, month, obligation.dueDayOfMonth);

        if (obligation.isAcessory) {
          const existing = await this.prisma.acessoryObligation.findFirst({
            where: { companyId, type: obligation.type, referenceMonth },
          });
          if (!existing) {
            const rec = await this.prisma.acessoryObligation.create({
              data: {
                companyId,
                type: obligation.type,
                referenceMonth,
                dueDate,
                status: 'draft',
              },
            });
            created.push({ kind: 'acessory', ...rec });
          }
        } else {
          const existing = await this.prisma.fiscalObligation.findFirst({
            where: { companyId, type: obligation.type, referenceMonth },
          });
          if (!existing) {
            const rec = await this.prisma.fiscalObligation.create({
              data: {
                companyId,
                name: `${obligation.name} - ${monthName}/${year}`,
                type: obligation.type,
                dueDate,
                referenceMonth,
                status: 'pending',
                alertDays: 5,
              },
            });
            created.push({ kind: 'fiscal', ...rec });
          }
        }
      }
    }

    // Obrigações anuais
    for (const annual of ANNUAL_OBLIGATIONS) {
      const applies =
        annual.taxRegimes.includes('all') ||
        annual.taxRegimes.includes(taxRegime);
      if (!applies) continue;

      const referenceMonth = `${year}-${String(annual.month).padStart(2, '0')}`;
      const dueDate = this._buildDueDate(year, annual.month - 1, annual.day);

      const existing = await this.prisma.fiscalObligation.findFirst({
        where: { companyId, type: annual.type, referenceMonth },
      });
      if (!existing) {
        const rec = await this.prisma.fiscalObligation.create({
          data: {
            companyId,
            name: `${annual.name} - ${year}`,
            type: annual.type,
            dueDate,
            referenceMonth,
            status: 'pending',
            alertDays: 15,
          },
        });
        created.push({ kind: 'annual', ...rec });
      }
    }

    return {
      year,
      companyId,
      taxRegime,
      createdCount: created.length,
      message: `${created.length} obrigações criadas para ${year}`,
    };
  }

  async findObligations(
    companyId: string,
    filters?: { month?: string; status?: string; type?: string },
  ) {
    return this.prisma.fiscalObligation.findMany({
      where: {
        companyId,
        ...(filters?.month && { referenceMonth: { contains: filters.month } }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.type && { type: filters.type }),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async updateObligationStatus(id: string, status: string, amount?: number, notes?: string) {
    const obligation = await this.prisma.fiscalObligation.findUnique({ where: { id } });
    if (!obligation) throw new NotFoundException(`Obrigação ${id} não encontrada`);
    return this.prisma.fiscalObligation.update({
      where: { id },
      data: { status, ...(amount !== undefined && { amount }), ...(notes && { notes }) },
    });
  }

  async findAcessoryObligations(companyId: string, referenceMonth?: string) {
    return this.prisma.acessoryObligation.findMany({
      where: {
        companyId,
        ...(referenceMonth && { referenceMonth }),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getUpcomingObligations(companyId: string, days: number = 30) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.fiscalObligation.findMany({
      where: {
        companyId,
        status: 'pending',
        dueDate: { lte: until },
      },
      orderBy: { dueDate: 'asc' },
    });
  }
}
