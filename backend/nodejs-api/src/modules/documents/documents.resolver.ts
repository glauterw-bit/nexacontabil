import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { DocumentsService } from './documents.service';

@ObjectType()
export class DocumentType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() type: string;
  @Field() status: string;
  @Field({ nullable: true }) number?: string;
  @Field({ nullable: true }) issuerName?: string;
  @Field({ nullable: true }) issuerCnpj?: string;
  @Field({ nullable: true }) totalValue?: number;
  @Field({ nullable: true }) confidenceScore?: number;
  @Field({ nullable: true }) issueDate?: Date;
  @Field({ nullable: true }) dueDate?: Date;
  @Field(() => GraphQLJSON, { nullable: true }) extractedData?: any;
  @Field(() => GraphQLJSON, { nullable: true }) fiscalValidation?: any;
  @Field(() => GraphQLJSON, { nullable: true }) complianceCheck?: any;
  @Field() createdAt: Date;
}

@ObjectType()
export class DocumentStatsType {
  @Field(() => Int) total: number;
  @Field(() => Int) pending: number;
  @Field(() => Int) completed: number;
  @Field(() => Int) failed: number;
  @Field(() => Float) totalValue: number;
}

@Resolver(() => DocumentType)
export class DocumentsResolver {
  constructor(private readonly documentsService: DocumentsService) {}

  @Query(() => [DocumentType])
  async documents(
    @Args('companyId') companyId: string,
    @Args('type', { nullable: true }) type?: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.documentsService.findAll(companyId, { type, status });
  }

  @Query(() => DocumentType)
  async document(@Args('id', { type: () => ID }) id: string) {
    return this.documentsService.findById(id);
  }

  @Query(() => DocumentStatsType)
  async documentStats(@Args('companyId') companyId: string) {
    return this.documentsService.getStats(companyId);
  }

  @Mutation(() => DocumentType)
  async updateDocumentStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('status') status: string,
  ) {
    return this.documentsService.updateStatus(id, status);
  }
}
