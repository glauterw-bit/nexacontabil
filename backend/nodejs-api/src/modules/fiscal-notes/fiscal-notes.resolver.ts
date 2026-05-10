import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GraphQLJSON } from 'graphql-type-json';
import { FiscalNotesService, FiscalNoteItem } from './fiscal-notes.service';

@ObjectType()
export class FiscalNoteBasicType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() type: string;
  @Field() status: string;
  @Field(() => Int, { nullable: true }) number?: number;
  @Field() series: string;
  @Field({ nullable: true }) accessKey?: string;
  @Field({ nullable: true }) protocolNumber?: string;
  @Field({ nullable: true }) xmlContent?: string;
  @Field({ nullable: true }) pdfUrl?: string;
  @Field({ nullable: true }) issueDate?: Date;
  @Field() recipientName: string;
  @Field() recipientCnpjCpf: string;
  @Field({ nullable: true }) recipientEmail?: string;
  @Field(() => GraphQLJSON) items: any;
  @Field(() => Float) totalValue: number;
  @Field(() => GraphQLJSON) totalTaxes: any;
  @Field({ nullable: true }) rejectionCode?: string;
  @Field({ nullable: true }) rejectionMessage?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@InputType()
export class FiscalNoteItemInput {
  @Field() @IsString() description: string;
  @Field(() => Float) @IsNumber() quantity: number;
  @Field(() => Float) @IsNumber() unitValue: number;
  @Field({ nullable: true }) @IsOptional() @IsString() ncm?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() cfop?: string;
}

@InputType()
export class CreateFiscalNoteInput {
  @Field() @IsString() companyId: string;
  @Field() @IsString() type: string;
  @Field() @IsString() recipientName: string;
  @Field() @IsString() recipientCnpjCpf: string;
  @Field({ nullable: true }) @IsOptional() @IsString() recipientEmail?: string;
  @Field(() => [FiscalNoteItemInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => FiscalNoteItemInput) items: FiscalNoteItemInput[];
  @Field(() => Float) @IsNumber() totalValue: number;
}

@Resolver(() => FiscalNoteBasicType)
export class FiscalNotesResolver {
  constructor(private readonly fiscalNotesService: FiscalNotesService) {}

  @Query(() => [FiscalNoteBasicType])
  async fiscalNotes(
    @Args('companyId') companyId: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.fiscalNotesService.findAll(companyId, status);
  }

  @Query(() => FiscalNoteBasicType)
  async fiscalNote(@Args('id', { type: () => ID }) id: string) {
    return this.fiscalNotesService.findById(id);
  }

  @Mutation(() => FiscalNoteBasicType)
  async createFiscalNote(@Args('input') input: CreateFiscalNoteInput) {
    return this.fiscalNotesService.create({
      ...input,
      items: input.items as FiscalNoteItem[],
    });
  }

  @Mutation(() => FiscalNoteBasicType)
  async sendFiscalNote(@Args('id', { type: () => ID }) id: string) {
    return this.fiscalNotesService.sendFiscalNote(id);
  }

  @Mutation(() => FiscalNoteBasicType)
  async cancelFiscalNote(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ) {
    return this.fiscalNotesService.cancelFiscalNote(id, reason);
  }
}
