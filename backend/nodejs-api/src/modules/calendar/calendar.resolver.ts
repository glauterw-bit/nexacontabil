import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { CalendarService } from './calendar.service';

@ObjectType()
export class FiscalObligationType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() name: string;
  @Field() type: string;
  @Field() dueDate: Date;
  @Field() referenceMonth: string;
  @Field() status: string;
  @Field(() => Float, { nullable: true }) amount?: number;
  @Field({ nullable: true }) notes?: string;
  @Field(() => Int) alertDays: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class AcessoryObligationType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() type: string;
  @Field() referenceMonth: string;
  @Field() status: string;
  @Field({ nullable: true }) xmlContent?: string;
  @Field() dueDate: Date;
  @Field({ nullable: true }) transmittedAt?: Date;
  @Field({ nullable: true }) errors?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class SeedCalendarResult {
  @Field(() => Int) year: number;
  @Field() companyId: string;
  @Field() taxRegime: string;
  @Field(() => Int) createdCount: number;
  @Field() message: string;
}

@Resolver()
export class CalendarResolver {
  constructor(private readonly calendarService: CalendarService) {}

  @Query(() => [FiscalObligationType])
  async fiscalObligations(
    @Args('companyId') companyId: string,
    @Args('month', { nullable: true }) month?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('type', { nullable: true }) type?: string,
  ) {
    return this.calendarService.findObligations(companyId, { month, status, type });
  }

  @Query(() => [FiscalObligationType])
  async upcomingObligations(
    @Args('companyId') companyId: string,
    @Args('days', { type: () => Int, nullable: true }) days?: number,
  ) {
    return this.calendarService.getUpcomingObligations(companyId, days);
  }

  @Query(() => [AcessoryObligationType])
  async acessoryObligations(
    @Args('companyId') companyId: string,
    @Args('referenceMonth', { nullable: true }) referenceMonth?: string,
  ) {
    return this.calendarService.findAcessoryObligations(companyId, referenceMonth);
  }

  @Mutation(() => SeedCalendarResult)
  async seedFiscalCalendar(
    @Args('companyId') companyId: string,
    @Args('year', { type: () => Int }) year: number,
  ) {
    return this.calendarService.seedFiscalCalendar(companyId, year);
  }

  @Mutation(() => FiscalObligationType)
  async updateObligationStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('status') status: string,
    @Args('amount', { type: () => Float, nullable: true }) amount?: number,
    @Args('notes', { nullable: true }) notes?: string,
  ) {
    return this.calendarService.updateObligationStatus(id, status, amount, notes);
  }
}
