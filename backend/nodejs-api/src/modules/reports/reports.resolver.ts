import { Resolver, Query, Args } from '@nestjs/graphql';
import { ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { ReportsService } from './reports.service';

@ObjectType()
export class DREPeriod {
  @Field() from: string;
  @Field() to: string;
}

@ObjectType()
export class DREAccountLine {
  @Field() code: string;
  @Field() name: string;
  @Field(() => Float) debit: number;
  @Field(() => Float) credit: number;
  @Field(() => Float) net: number;
}

@ObjectType()
export class DREGroup {
  @Field() code: string;
  @Field() name: string;
  @Field(() => [DREAccountLine]) accounts: DREAccountLine[];
  @Field(() => Float) totalDebit: number;
  @Field(() => Float) totalCredit: number;
  @Field(() => Float) net: number;
}

@ObjectType()
export class DREResult {
  @Field() companyId: string;
  @Field(() => DREPeriod) period: DREPeriod;
  @Field(() => [DREGroup]) groups: DREGroup[];
  @Field(() => Float) grossRevenue: number;
  @Field(() => Float) totalCosts: number;
  @Field(() => Float) grossProfit: number;
  @Field(() => Float) operationalExpenses: number;
  @Field(() => Float) ebit: number;
  @Field(() => Float) financialResult: number;
  @Field(() => Float) ebt: number;
  @Field(() => Float) taxes: number;
  @Field(() => Float) netIncome: number;
  @Field() generatedAt: string;
}

@ObjectType()
export class BalanceSummary {
  @Field(() => Int) total: number;
  @Field(() => Int) pending: number;
  @Field(() => Int) approved: number;
  @Field(() => Float) totalDebit: number;
  @Field(() => Float) totalCredit: number;
}

@Resolver()
export class ReportsResolver {
  constructor(private readonly reportsService: ReportsService) {}

  @Query(() => DREResult)
  async getDRE(
    @Args('companyId') companyId: string,
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<DREResult> {
    return this.reportsService.getDRE(
      companyId,
      new Date(from),
      new Date(to),
    );
  }

  @Query(() => BalanceSummary)
  async balanceSummary(@Args('companyId') companyId: string) {
    return this.reportsService.getBalanceSummary(companyId);
  }
}
