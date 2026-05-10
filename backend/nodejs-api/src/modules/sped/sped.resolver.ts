import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Int } from '@nestjs/graphql';
import { SpedService } from './sped.service';

@ObjectType()
class SpedFileType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() tipo: string;
  @Field() referenceMonth: string;
  @Field() status: string;
  @Field(() => Int) linhas: number;
  @Field({ nullable: true }) fileHash?: string;
  @Field({ nullable: true }) fileContent?: string;
  @Field() createdAt: Date;
}

@Resolver()
export class SpedResolver {
  constructor(private readonly spedService: SpedService) {}

  @Query(() => [SpedFileType])
  async listarArquivosSped(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('tipo', { nullable: true }) tipo?: string,
  ) {
    return this.spedService.listarArquivos(companyId, tipo);
  }

  @Query(() => SpedFileType)
  async baixarArquivoSped(@Args('id', { type: () => ID }) id: string) {
    return this.spedService.baixarArquivo(id);
  }

  @Mutation(() => SpedFileType)
  async gerarSpedFiscal(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.spedService.gerarSpedFiscal(companyId, referenceMonth);
  }

  @Mutation(() => SpedFileType)
  async gerarEfdContribuicoes(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.spedService.gerarEfdContribuicoes(companyId, referenceMonth);
  }

  @Mutation(() => SpedFileType)
  async gerarEcf(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('anoBase', { type: () => Int }) anoBase: number,
  ) {
    return this.spedService.gerarEcf(companyId, anoBase);
  }

  @Mutation(() => SpedFileType)
  async gerarEcd(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('anoBase', { type: () => Int }) anoBase: number,
  ) {
    return this.spedService.gerarEcd(companyId, anoBase);
  }

  @Mutation(() => SpedFileType)
  async gerarEfdReinf(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.spedService.gerarEfdReinf(companyId, referenceMonth);
  }
}
