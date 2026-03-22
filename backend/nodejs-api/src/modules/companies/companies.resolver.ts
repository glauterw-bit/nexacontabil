import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, InputType } from '@nestjs/graphql';
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
  @Field() name: string;
  @Field() cnpj: string;
  @Field() taxRegime: string;
  @Field({ nullable: true }) address?: string;
  @Field({ nullable: true }) phone?: string;
  @Field({ nullable: true }) email?: string;
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
  async deactivateCompany(@Args('id', { type: () => ID }) id: string) {
    return this.companiesService.deactivate(id);
  }
}
