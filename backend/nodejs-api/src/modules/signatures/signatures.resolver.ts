import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, InputType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsArray, IsEmail, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GraphQLJSON } from 'graphql-type-json';
import { SignaturesService } from './signatures.service';

@ObjectType()
export class SignatureRequestType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() title: string;
  @Field() documentUrl: string;
  @Field(() => GraphQLJSON) signers: any;
  @Field() status: string;
  @Field({ nullable: true }) signedDocUrl?: string;
  @Field() expiresAt: Date;
  @Field({ nullable: true }) completedAt?: Date;
  @Field(() => GraphQLJSON) auditLog: any;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@InputType()
export class SignerInput {
  @Field() @IsString() name: string;
  @Field() @IsEmail() email: string;
  @Field({ nullable: true }) @IsOptional() @IsString() role?: string;
}

@InputType()
export class CreateSignatureRequestInput {
  @Field() @IsString() companyId: string;
  @Field() @IsString() title: string;
  @Field() @IsString() documentUrl: string;
  @Field(() => [SignerInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => SignerInput) signers: SignerInput[];
  @Field(() => Int, { nullable: true }) @IsOptional() expiresInDays?: number;
}

@Resolver(() => SignatureRequestType)
export class SignaturesResolver {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Query(() => [SignatureRequestType])
  async signatureRequests(
    @Args('companyId') companyId: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.signaturesService.findAll(companyId, status);
  }

  @Query(() => SignatureRequestType)
  async signatureRequest(@Args('id', { type: () => ID }) id: string) {
    return this.signaturesService.findById(id);
  }

  @Mutation(() => SignatureRequestType)
  async createSignatureRequest(@Args('input') input: CreateSignatureRequestInput) {
    return this.signaturesService.createRequest(input);
  }

  @Mutation(() => SignatureRequestType)
  async signDocument(
    @Args('requestId', { type: () => ID }) requestId: string,
    @Args('token') token: string,
  ) {
    return this.signaturesService.sign(requestId, token);
  }

  @Mutation(() => SignatureRequestType)
  async cancelSignatureRequest(@Args('id', { type: () => ID }) id: string) {
    return this.signaturesService.cancelRequest(id);
  }
}
