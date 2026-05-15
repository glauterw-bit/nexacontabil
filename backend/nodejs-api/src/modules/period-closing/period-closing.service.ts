import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail?: string;
  href?: string;
}

@Injectable()
export class PeriodClosingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna (ou cria em status em_andamento) o registro do fechamento do periodo.
   * Tambem calcula o checklist automatico verificando:
   * - obrigacoes vencidas no periodo
   * - transactions pendentes (rascunho)
   * - documentos sem classificacao
   * - holerites por funcionario ativo
   * - bancos sem sincronizacao recente
   */
  async getOrCreate(companyId: string, ano: number, mes: number) {
    let row = await this.prisma.accountingPeriodClosing.findUnique({
      where: { companyId_ano_mes: { companyId, ano, mes } },
    });
    if (!row) {
      row = await this.prisma.accountingPeriodClosing.create({
        data: { companyId, ano, mes, status: 'em_andamento' },
      });
    }
    const checklist = await this.computeChecklist(companyId, ano, mes, row.status === 'fechado');
    return { ...row, checklist };
  }

  async computeChecklist(companyId: string, ano: number, mes: number, isClosed: boolean): Promise<ChecklistItem[]> {
    const monthStart = new Date(ano, mes - 1, 1, 0, 0, 0);
    const monthEnd = new Date(ano, mes, 0, 23, 59, 59);

    // 1) Lancamentos rascunho/needs_review no periodo
    const draftTransactions = await this.prisma.transaction.count({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
        status: { in: ['draft', 'needs_review'] },
      },
    });

    // 2) Documentos sem classificacao
    const undocumented = await this.prisma.document.count({
      where: {
        companyId,
        createdAt: { gte: monthStart, lte: monthEnd },
        status: { in: ['pending', 'needs_review'] },
      },
    });

    // 3) Obrigacoes vencidas no periodo nao pagas
    const overdueObrigacoes = await this.prisma.fiscalCalendarItem.count({
      where: {
        companyId,
        dataVencimento: { gte: monthStart, lte: monthEnd },
        status: { in: ['pendente', 'em_apuracao', 'apurada', 'vencida'] },
      },
    });

    // 4) Funcionarios ativos sem holerite no mes
    const refMonth = `${ano}-${String(mes).padStart(2, '0')}`;
    const activeEmployees = await this.prisma.employee.count({
      where: { companyId, active: true, dismissalDate: null },
    });
    const holerites = await this.prisma.payslip.count({
      where: { companyId, referenceMonth: refMonth },
    });
    const missingHolerite = Math.max(0, activeEmployees - holerites);

    // 5) Bancos sincronizados recentemente
    const banks = await this.prisma.bankConnection.findMany({
      where: { companyId },
      select: { id: true, bankName: true, lastSyncAt: true },
    });
    const staleBanks = banks.filter((b) => {
      if (!b.lastSyncAt) return true;
      return new Date(b.lastSyncAt) < monthEnd;
    });

    // 6) Documentos auditados (auditTrail no periodo)
    const auditCount = await this.prisma.auditTrail.count({
      where: { companyId, createdAt: { gte: monthStart, lte: monthEnd } },
    });

    return [
      {
        key: 'transactions',
        label: 'Todos os lançamentos do mês estão aprovados',
        done: draftTransactions === 0,
        detail: draftTransactions > 0 ? `${draftTransactions} lançamento(s) em rascunho` : 'OK',
        href: '/transactions',
      },
      {
        key: 'documents',
        label: 'Documentos do mês foram classificados pela IA',
        done: undocumented === 0,
        detail: undocumented > 0 ? `${undocumented} documento(s) pendente(s)` : 'OK',
        href: '/inteligencia',
      },
      {
        key: 'obrigacoes',
        label: 'Obrigações fiscais do mês foram processadas',
        done: overdueObrigacoes === 0,
        detail: overdueObrigacoes > 0 ? `${overdueObrigacoes} obrigação(ões) pendente(s)` : 'OK',
        href: '/agenda',
      },
      {
        key: 'folha',
        label: 'Holerites de todos funcionários ativos gerados',
        done: activeEmployees === 0 || missingHolerite === 0,
        detail:
          activeEmployees === 0
            ? 'Nenhum funcionário ativo'
            : missingHolerite > 0
            ? `${missingHolerite} funcionário(s) sem holerite`
            : `${holerites}/${activeEmployees} OK`,
        href: '/folha',
      },
      {
        key: 'banking',
        label: 'Bancos sincronizados até fim do mês',
        done: banks.length === 0 || staleBanks.length === 0,
        detail:
          banks.length === 0
            ? 'Nenhum banco conectado'
            : staleBanks.length > 0
            ? `${staleBanks.length} banco(s) defasado(s)`
            : `${banks.length} sincronizado(s)`,
        href: '/banking',
      },
      {
        key: 'audit',
        label: 'Trilha de auditoria ativa no período',
        done: auditCount > 0 || isClosed,
        detail: `${auditCount} evento(s) registrados`,
        href: '/audit',
      },
    ];
  }

  /**
   * Fecha o periodo: trava o status pra 'fechado', gera hash do estado.
   * Bloqueia se houver itens pendentes (a nao ser que forceClose=true).
   */
  async close(companyId: string, ano: number, mes: number, closedBy: string, forceClose = false) {
    const row = await this.getOrCreate(companyId, ano, mes);
    if (row.status === 'fechado') {
      throw new BadRequestException('Periodo ja esta fechado');
    }
    const checklist = await this.computeChecklist(companyId, ano, mes, false);
    const pending = checklist.filter((c) => !c.done);
    if (pending.length > 0 && !forceClose) {
      throw new BadRequestException(`${pending.length} item(s) do checklist pendente(s). Use forceClose=true para fechar mesmo assim.`);
    }

    const monthStart = new Date(ano, mes - 1, 1);
    const monthEnd = new Date(ano, mes, 0, 23, 59, 59);
    const transactions = await this.prisma.transaction.findMany({
      where: { companyId, date: { gte: monthStart, lte: monthEnd } },
      select: { id: true, totalDebit: true, totalCredit: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const payload = JSON.stringify({ companyId, ano, mes, transactions });
    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    return this.prisma.accountingPeriodClosing.update({
      where: { id: row.id },
      data: {
        status: 'fechado',
        closedAt: new Date(),
        closedBy,
        hash,
        checklistJson: JSON.stringify(checklist),
      },
    });
  }

  async reopen(companyId: string, ano: number, mes: number, reopenedBy: string, motivo: string) {
    if (!motivo || motivo.length < 15) {
      throw new BadRequestException('Motivo da reabertura precisa ter pelo menos 15 caracteres');
    }
    const row = await this.prisma.accountingPeriodClosing.findUnique({
      where: { companyId_ano_mes: { companyId, ano, mes } },
    });
    if (!row) throw new NotFoundException('Periodo nao encontrado');
    if (row.status !== 'fechado') {
      throw new BadRequestException('Periodo nao esta fechado');
    }
    return this.prisma.accountingPeriodClosing.update({
      where: { id: row.id },
      data: {
        status: 'reaberto',
        reopenedAt: new Date(),
        reopenedBy,
        reopenedMotivo: motivo,
      },
    });
  }

  async listByCompany(companyId: string) {
    return this.prisma.accountingPeriodClosing.findMany({
      where: { companyId },
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
    });
  }

  /**
   * Verifica se um lancamento contabil em determinada data esta em periodo fechado.
   * Usado por outros services antes de criar/editar transactions.
   */
  async isLocked(companyId: string, date: Date): Promise<boolean> {
    const ano = date.getFullYear();
    const mes = date.getMonth() + 1;
    const row = await this.prisma.accountingPeriodClosing.findUnique({
      where: { companyId_ano_mes: { companyId, ano, mes } },
    });
    return row?.status === 'fechado';
  }
}
