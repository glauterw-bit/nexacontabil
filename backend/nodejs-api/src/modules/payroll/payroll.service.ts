import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateEmployeeDto {
  companyId: string;
  name: string;
  cpf: string;
  ctps?: string;
  pis?: string;
  role: string;
  department?: string;
  admissionDate: Date;
  baseSalary: number;
  workHoursWeekly?: number;
  dependents?: number;
  bank?: string;
  bankAgency?: string;
  bankAccount?: string;
}

export interface CalculatePayslipDto {
  employeeId: string;
  companyId: string;
  referenceMonth: string;
  overtimeHours?: number;
  bonuses?: number;
  otherDeductions?: number;
}

interface InssResult {
  employee: number;
  employer: number;
}

interface IrrfResult {
  value: number;
  base: number;
  rate: number;
  deduction: number;
}

interface PayslipBreakdown {
  grossSalary: number;
  inssEmployee: number;
  inssEmployer: number;
  irrf: number;
  irrfBase: number;
  fgts: number;
  netSalary: number;
  overtimeValue: number;
  bonuses: number;
  otherDeductions: number;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── INSS 2025 progressive table ───────────────────────────────
  private _calcInss(grossSalary: number): InssResult {
    // Faixas 2025: cada faixa é tributada separadamente (progressivo)
    const brackets = [
      { limit: 1518.0,  rate: 0.075 },
      { limit: 2793.88, rate: 0.09  },
      { limit: 4190.83, rate: 0.12  },
      { limit: 8157.41, rate: 0.14  },
    ];

    let employeeInss = 0;
    let remaining = grossSalary;
    let prevLimit = 0;

    for (const bracket of brackets) {
      if (remaining <= 0) break;
      const taxable = Math.min(remaining, bracket.limit - prevLimit);
      employeeInss += taxable * bracket.rate;
      remaining -= taxable;
      prevLimit = bracket.limit;
    }

    // Cap: teto INSS 2025 = 8157.41 * 14% = 1142.04 (already handled by brackets)
    const employerInss = grossSalary * 0.20;

    return {
      employee: Math.round(employeeInss * 100) / 100,
      employer: Math.round(employerInss * 100) / 100,
    };
  }

  // ─── IRRF 2025 table ───────────────────────────────────────────
  private _calcIrrf(grossSalary: number, inssEmployee: number, dependents: number): IrrfResult {
    const dependentDeduction = dependents * 189.59;
    const base = grossSalary - inssEmployee - dependentDeduction;

    let rate = 0;
    let deduction = 0;

    if (base <= 2259.20) {
      rate = 0; deduction = 0;
    } else if (base <= 2826.65) {
      rate = 0.075; deduction = 169.44;
    } else if (base <= 3751.05) {
      rate = 0.15;  deduction = 381.44;
    } else if (base <= 4664.68) {
      rate = 0.225; deduction = 662.77;
    } else {
      rate = 0.275;  deduction = 896.00;
    }

    const value = Math.max(0, Math.round((base * rate - deduction) * 100) / 100);
    return { value, base: Math.round(base * 100) / 100, rate, deduction };
  }

  // ─── Public Methods ────────────────────────────────────────────

  async createEmployee(dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        cpf: dto.cpf,
        ctps: dto.ctps,
        pis: dto.pis,
        role: dto.role,
        department: dto.department,
        admissionDate: dto.admissionDate,
        baseSalary: dto.baseSalary,
        workHoursWeekly: dto.workHoursWeekly ?? 44,
        dependents: dto.dependents ?? 0,
        bank: dto.bank,
        bankAgency: dto.bankAgency,
        bankAccount: dto.bankAccount,
        active: true,
      },
    });
  }

  async findAllEmployees(companyId: string) {
    return this.prisma.employee.findMany({
      where: { companyId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findEmployee(id: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException(`Funcionário ${id} não encontrado`);
    return emp;
  }

  async calculatePayslip(dto: CalculatePayslipDto) {
    const employee = await this.findEmployee(dto.employeeId);

    const overtimeHours = dto.overtimeHours ?? 0;
    const bonuses = dto.bonuses ?? 0;
    const otherDeductions = dto.otherDeductions ?? 0;

    // Hora extra: 50% adicional sobre hora normal
    const hourlyRate = (employee.baseSalary / 30 / 8);
    const overtimeValue = Math.round(overtimeHours * hourlyRate * 1.5 * 100) / 100;

    const grossSalary = Math.round((employee.baseSalary + overtimeValue + bonuses) * 100) / 100;

    const inssResult = this._calcInss(grossSalary);
    const irrfResult = this._calcIrrf(grossSalary, inssResult.employee, employee.dependents);
    const fgts = Math.round(grossSalary * 0.08 * 100) / 100;

    const totalDeductions = inssResult.employee + irrfResult.value + otherDeductions;
    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

    const breakdown: PayslipBreakdown = {
      grossSalary,
      inssEmployee: inssResult.employee,
      inssEmployer: inssResult.employer,
      irrf: irrfResult.value,
      irrfBase: irrfResult.base,
      fgts,
      netSalary,
      overtimeValue,
      bonuses,
      otherDeductions,
    };

    return this.prisma.payslip.create({
      data: {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        referenceMonth: dto.referenceMonth,
        baseSalary: employee.baseSalary,
        overtimeHours,
        overtimeValue,
        bonuses,
        otherDeductions,
        inssEmployee: inssResult.employee,
        inssEmployer: inssResult.employer,
        irrf: irrfResult.value,
        fgts,
        grossSalary,
        netSalary,
        breakdown: JSON.stringify(breakdown),
        status: 'draft',
      },
      include: { employee: true },
    });
  }

  async findPayslips(companyId: string, referenceMonth?: string) {
    return this.prisma.payslip.findMany({
      where: {
        companyId,
        ...(referenceMonth && { referenceMonth }),
      },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approvePayslip(id: string, userId: string) {
    const slip = await this.prisma.payslip.findUnique({ where: { id } });
    if (!slip) throw new NotFoundException(`Holerite ${id} não encontrado`);
    return this.prisma.payslip.update({
      where: { id },
      data: { status: 'approved', approvedBy: userId },
    });
  }
}
