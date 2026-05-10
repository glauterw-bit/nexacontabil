import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsString, IsOptional } from 'class-validator';
import { BankingService } from './banking.service';

@ObjectType()
export class BankStatementType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() connectionId: string;
  @Field() date: Date;
  @Field() description: string;
  @Field(() => Float) amount: number;
  @Field() type: string;
  @Field(() => Float, { nullable: true }) balance?: number;
  @Field({ nullable: true }) category?: string;
  @Field() reconciled: boolean;
  @Field() createdAt: Date;
}

@ObjectType()
export class BankConnectionType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() bankName: string;
  @Field() bankCode: string;
  @Field() status: string;
  @Field({ nullable: true }) accountType?: string;
  @Field({ nullable: true }) lastSyncAt?: Date;
  @Field(() => [BankStatementType]) statements: BankStatementType[];
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class SyncResult {
  @Field() connectionId: string;
  @Field(() => Int) syncedCount: number;
  @Field() lastSyncAt: string;
  @Field(() => [BankStatementType]) statements: BankStatementType[];
}

@InputType()
export class CreateBankConnectionInput {
  @Field() @IsString() companyId: string;
  @Field() @IsString() bankName: string;
  @Field() @IsString() bankCode: string;
  @Field({ nullable: true }) @IsOptional() @IsString() accountType?: string;
}

@Resolver(() => BankConnectionType)
export class BankingResolver {
  constructor(private readonly bankingService: BankingService) {}

  @Query(() => [BankConnectionType])
  async bankConnections(@Args('companyId') companyId: string) {
    return this.bankingService.findConnections(companyId);
  }

  @Query(() => BankConnectionType)
  async bankConnection(@Args('id', { type: () => ID }) id: string) {
    return this.bankingService.findConnection(id);
  }

  @Query(() => [BankStatementType])
  async bankStatements(
    @Args('connectionId') connectionId: string,
    @Args('from', { nullable: true }) from?: string,
    @Args('to', { nullable: true }) to?: string,
  ) {
    return this.bankingService.getStatements(
      connectionId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Mutation(() => BankConnectionType)
  async createBankConnection(@Args('input') input: CreateBankConnectionInput) {
    return this.bankingService.createConnection(input);
  }

  @Mutation(() => SyncResult)
  async syncBankStatements(@Args('connectionId') connectionId: string) {
    return this.bankingService.syncBankStatements(connectionId);
  }
}
