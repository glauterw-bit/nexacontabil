import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { ReconciliationService } from './reconciliation.service';

@ObjectType()
export class ReconciliationRunType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() matchType: string;
  @Field() status: string;
  @Field(() => Int) matchesCount: number;
  @Field(() => Int) unmatchedCount: number;
  @Field(() => Float) totalMatchedValue: number;
  @Field(() => Float) totalUnmatchedValue: number;
  @Field(() => GraphQLJSON) matches: any;
  @Field() createdAt: Date;
}

@Resolver()
export class ReconciliationResolver {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Query(() => [ReconciliationRunType])
  async reconciliationHistory(@Args('companyId') companyId: string) {
    return this.reconciliationService.getHistory(companyId);
  }

  @Mutation(() => GraphQLJSON)
  async runReconciliation(
    @Args('companyId') companyId: string,
    @Args('matchType') matchType: string,
    @Args('sources', { type: () => GraphQLJSON }) sources: any[],
    @Args('targets', { type: () => GraphQLJSON }) targets: any[],
  ) {
    return this.reconciliationService.runReconciliation(companyId, sources, targets, matchType);
  }
}
