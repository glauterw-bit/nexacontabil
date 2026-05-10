import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';
import { ExecutiveReportsService } from './executive-reports.service';

@ObjectType()
export class ExecutiveReportType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() referenceMonth: string;
  @Field() content: string;
  @Field() status: string;
  @Field({ nullable: true }) sentAt?: Date;
  @Field() channel: string;
  @Field() createdAt: Date;
}

@Resolver(() => ExecutiveReportType)
export class ExecutiveReportsResolver {
  constructor(private readonly executiveReportsService: ExecutiveReportsService) {}

  @Query(() => [ExecutiveReportType])
  async executiveReports(@Args('companyId') companyId: string) {
    return this.executiveReportsService.findAll(companyId);
  }

  @Query(() => ExecutiveReportType)
  async executiveReport(@Args('id', { type: () => ID }) id: string) {
    return this.executiveReportsService.findById(id);
  }

  @Mutation(() => ExecutiveReportType)
  async generateExecutiveReport(
    @Args('companyId') companyId: string,
    @Args('referenceMonth') referenceMonth: string,
    @Args('channel', { nullable: true }) channel?: string,
  ) {
    return this.executiveReportsService.generateExecutiveReport(
      companyId,
      referenceMonth,
      channel ?? 'whatsapp',
    );
  }

  @Mutation(() => ExecutiveReportType)
  async markReportAsSent(@Args('id', { type: () => ID }) id: string) {
    return this.executiveReportsService.markAsSent(id);
  }
}
