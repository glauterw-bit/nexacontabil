import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, IsDate } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import { PayrollService } from './payroll.service';

// ─── Employee ObjectType ─────────────────────────────────────
@ObjectType()
export class EmployeeType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() name: string;
  @Field() cpf: string;
  @Field({ nullable: true }) ctps?: string;
  @Field({ nullable: true }) pis?: string;
  @Field() role: string;
  @Field({ nullable: true }) department?: string;
  @Field() admissionDate: Date;
  @Field({ nullable: true }) dismissalDate?: Date;
  @Field(() => Float) baseSalary: number;
  @Field(() => Int) workHoursWeekly: number;
  @Field(() => Int) dependents: number;
  @Field({ nullable: true }) bank?: string;
  @Field({ nullable: true }) bankAgency?: string;
  @Field({ nullable: true }) bankAccount?: string;
  @Field() active: boolean;
  @Field() createdAt: Date;
}

// ─── Payslip ObjectType ──────────────────────────────────────
@ObjectType()
export class PayslipType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() employeeId: string;
  @Field(() => EmployeeType, { nullable: true }) employee?: EmployeeType;
  @Field() referenceMonth: string;
  @Field(() => Float) baseSalary: number;
  @Field(() => Float) overtimeHours: number;
  @Field(() => Float) overtimeValue: number;
  @Field(() => Float) bonuses: number;
  @Field(() => Float) otherDeductions: number;
  @Field(() => Float) inssEmployee: number;
  @Field(() => Float) inssEmployer: number;
  @Field(() => Float) irrf: number;
  @Field(() => Float) fgts: number;
  @Field(() => Float) grossSalary: number;
  @Field(() => Float) netSalary: number;
  @Field(() => GraphQLJSON) breakdown: any;
  @Field() status: string;
  @Field({ nullable: true }) paymentDate?: Date;
  @Field({ nullable: true }) approvedBy?: string;
  @Field() createdAt: Date;
}

// ─── Input Types ─────────────────────────────────────────────
@InputType()
export class CreateEmployeeInput {
  @Field() @IsString() companyId: string;
  @Field() @IsString() name: string;
  @Field() @IsString() cpf: string;
  @Field({ nullable: true }) @IsOptional() @IsString() ctps?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() pis?: string;
  @Field() @IsString() role: string;
  @Field({ nullable: true }) @IsOptional() @IsString() department?: string;
  @Field() admissionDate: Date;
  @Field(() => Float) @IsNumber() baseSalary: number;
  @Field(() => Int, { nullable: true }) @IsOptional() workHoursWeekly?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() dependents?: number;
  @Field({ nullable: true }) @IsOptional() @IsString() bank?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() bankAgency?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() bankAccount?: string;
}

@InputType()
export class CalculatePayslipInput {
  @Field() @IsString() employeeId: string;
  @Field() @IsString() companyId: string;
  @Field() @IsString() referenceMonth: string;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() overtimeHours?: number;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() bonuses?: number;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() otherDeductions?: number;
}

// ─── Resolver ────────────────────────────────────────────────
@Resolver(() => EmployeeType)
export class PayrollResolver {
  constructor(private readonly payrollService: PayrollService) {}

  @Query(() => [EmployeeType])
  async employees(@Args('companyId') companyId: string) {
    return this.payrollService.findAllEmployees(companyId);
  }

  @Query(() => EmployeeType)
  async employee(@Args('id', { type: () => ID }) id: string) {
    return this.payrollService.findEmployee(id);
  }

  @Query(() => [PayslipType])
  async payslips(
    @Args('companyId') companyId: string,
    @Args('referenceMonth', { nullable: true }) referenceMonth?: string,
  ) {
    return this.payrollService.findPayslips(companyId, referenceMonth);
  }

  @Mutation(() => EmployeeType)
  async createEmployee(@Args('input') input: CreateEmployeeInput) {
    return this.payrollService.createEmployee(input);
  }

  @Mutation(() => PayslipType)
  async calculatePayslip(@Args('input') input: CalculatePayslipInput) {
    return this.payrollService.calculatePayslip(input);
  }

  @Mutation(() => PayslipType)
  async approvePayslip(
    @Args('id', { type: () => ID }) id: string,
    @Args('userId') userId: string,
  ) {
    return this.payrollService.approvePayslip(id, userId);
  }
}
