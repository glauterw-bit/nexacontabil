import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { TransactionsService, CreateTransactionDto } from './transactions.service';

@ObjectType()
export class TransactionObjectType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field({ nullable: true }) documentId?: string;
  @Field() description: string;
  @Field() date: Date;
  @Field() status: string;
  @Field(() => GraphQLJSON) entries: any;
  @Field(() => Float) totalDebit: number;
  @Field(() => Float) totalCredit: number;
  @Field() isBalanced: boolean;
  @Field({ nullable: true }) aiConfidence?: number;
  @Field({ nullable: true }) approvedBy?: string;
  @Field({ nullable: true }) approvedAt?: Date;
  @Field() createdAt: Date;
}

@InputType()
export class AccountingEntryInput {
  @Field() accountCode: string;
  @Field() accountName: string;
  @Field() nature: string;
  @Field(() => Float) value: number;
  @Field({ nullable: true }) costCenter?: string;
  @Field({ nullable: true }) description?: string;
}

@InputType()
export class CreateTransactionInput {
  @Field() companyId: string;
  @Field({ nullable: true }) documentId?: string;
  @Field() description: string;
  @Field() date: Date;
  @Field(() => [AccountingEntryInput]) entries: AccountingEntryInput[];
}

@Resolver(() => TransactionObjectType)
export class TransactionsResolver {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Query(() => [TransactionObjectType])
  async transactions(
    @Args('companyId') companyId: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.transactionsService.findAll(companyId, { status });
  }

  @Query(() => TransactionObjectType)
  async transaction(@Args('id', { type: () => ID }) id: string) {
    return this.transactionsService.findById(id);
  }

  @Mutation(() => TransactionObjectType)
  async createTransaction(@Args('input') input: CreateTransactionInput) {
    return this.transactionsService.create({
      ...input,
      entries: input.entries.map(e => ({
        ...e,
        nature: e.nature as 'debit' | 'credit',
      })),
    });
  }

  @Mutation(() => TransactionObjectType)
  async approveTransaction(
    @Args('id', { type: () => ID }) id: string,
    @Args('userId') userId: string,
  ) {
    return this.transactionsService.approve(id, userId);
  }

  @Mutation(() => TransactionObjectType)
  async rejectTransaction(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ) {
    return this.transactionsService.reject(id, reason);
  }
}
