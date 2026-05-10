import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, InputType } from '@nestjs/graphql';
import { IsString, IsOptional, IsEmail } from 'class-validator';
import { CompaniesService, CreateCompanyDto } from './companies.service';

@ObjectType()
export class CompanyType {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() cnpj: string;
  @Field() taxRegime: string;
  @Field({ nullable: true }) address?: string;
  @Field({ nullable: true }) phone?: string;
  @Field({ nullable: true }) email?: string;
  @Field() active: boolean;
  @Field() createdAt: Date;
}

@InputType()
export class CreateCompanyInput implements CreateCompanyDto {
  @Field() @IsString() name: string;
  @Field() @IsString() cnpj: string;
  @Field() @IsString() taxRegime: string;
  @Field({ nullable: true }) @IsOptional() @IsString() address?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() phone?: string;
  @Field({ nullable: true }) @IsOptional() @IsEmail() email?: string;
}

@Resolver(() => CompanyType)
export class CompaniesResolver {
  constructor(private readonly companiesService: CompaniesService) {}

  @Query(() => [CompanyType])
  async companies() {
    return this.companiesService.findAll();
  }

  @Query(() => CompanyType)
  async company(@Args('id', { type: () => ID }) id: string) {
    return this.companiesService.findById(id);
  }

  @Mutation(() => CompanyType)
  async createCompany(@Args('input') input: CreateCompanyInput) {
    return this.companiesService.create(input);
  }

  @Mutation(() => CompanyType)
  async updateCompany(
    @Args('id', { type: () => ID }) id: string,
    @Args('name', { nullable: true }) name?: string,
    @Args('address', { nullable: true }) address?: string,
    @Args('phone', { nullable: true }) phone?: string,
    @Args('email', { nullable: true }) email?: string,
    @Args('taxRegime', { nullable: true }) taxRegime?: string,
  ) {
    return this.companiesService.update(id, { name, address, phone, email, taxRegime });
  }

  @Mutation(() => CompanyType)
  async deactivateCompany(@Args('id', { type: () => ID }) id: string) {
    return this.companiesService.deactivate(id);
  }
}
