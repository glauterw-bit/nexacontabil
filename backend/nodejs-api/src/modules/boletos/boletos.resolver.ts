import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType } from '@nestjs/graphql';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { BoletosService } from './boletos.service';

@ObjectType()
export class BoletoType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() beneficiaryName: string;
  @Field() beneficiaryCnpj: string;
  @Field() payerName: string;
  @Field() payerCnpjCpf: string;
  @Field({ nullable: true }) payerEmail?: string;
  @Field(() => Float) amount: number;
  @Field() dueDate: Date;
  @Field() issueDate: Date;
  @Field() ourNumber: string;
  @Field({ nullable: true }) digitableLine?: string;
  @Field({ nullable: true }) barcode?: string;
  @Field() bankCode: string;
  @Field() status: string;
  @Field({ nullable: true }) instructions?: string;
  @Field(() => Float) fine: number;
  @Field(() => Float) interest: number;
  @Field(() => Float) discount: number;
  @Field({ nullable: true }) paidAt?: Date;
  @Field(() => Float, { nullable: true }) paidAmount?: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@InputType()
export class CreateBoletoInput {
  @Field() @IsString() companyId: string;
  @Field() @IsString() beneficiaryName: string;
  @Field() @IsString() beneficiaryCnpj: string;
  @Field() @IsString() payerName: string;
  @Field() @IsString() payerCnpjCpf: string;
  @Field({ nullable: true }) @IsOptional() @IsString() payerEmail?: string;
  @Field(() => Float) @IsNumber() amount: number;
  @Field() dueDate: Date;
  @Field({ nullable: true }) @IsOptional() @IsString() bankCode?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() instructions?: string;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() fine?: number;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() interest?: number;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() discount?: number;
}

@Resolver(() => BoletoType)
export class BoletosResolver {
  constructor(private readonly boletosService: BoletosService) {}

  @Query(() => [BoletoType])
  async boletos(
    @Args('companyId') companyId: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.boletosService.findAll(companyId, status);
  }

  @Query(() => BoletoType)
  async boleto(@Args('id', { type: () => ID }) id: string) {
    return this.boletosService.findById(id);
  }

  @Mutation(() => BoletoType)
  async createBoleto(@Args('input') input: CreateBoletoInput) {
    return this.boletosService.create(input);
  }

  @Mutation(() => BoletoType)
  async markBoletoAsPaid(
    @Args('id', { type: () => ID }) id: string,
    @Args('paidAmount', { type: () => Float, nullable: true }) paidAmount?: number,
  ) {
    return this.boletosService.markAsPaid(id, paidAmount);
  }

  @Mutation(() => BoletoType)
  async cancelBoleto(@Args('id', { type: () => ID }) id: string) {
    return this.boletosService.cancelBoleto(id);
  }
}
