import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { SimplesNacionalService } from './simples-nacional.service';

@ObjectType()
class SimplesApuracaoType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() referenceMonth: string;
  @Field(() => Float) receita: number;
  @Field(() => Float) rbr12: number;
  @Field(() => Float) aliquotaEfetiva: number;
  @Field() anexo: string;
  @Field(() => Int) faixaIdx: number;
  @Field(() => Float) fatorR: number;
  @Field(() => Float) dasTotal: number;
  @Field(() => Float) irpj: number;
  @Field(() => Float) csll: number;
  @Field(() => Float) cofins: number;
  @Field(() => Float) pis: number;
  @Field(() => Float) cpp: number;
  @Field(() => Float) icms: number;
  @Field(() => Float) iss: number;
  @Field(() => Float) ipi: number;
  @Field() status: string;
  @Field({ nullable: true }) codigoBarras?: string;
  @Field({ nullable: true }) vencimento?: Date;
}

@ObjectType()
class RegimeSimulacaoItemType {
  @Field(() => Float) aliquotaEfetiva: number;
  @Field(() => Float) tributacaoMensal: number;
  @Field(() => Float) tributacaoAnual: number;
}

@ObjectType()
class SimplesSimulacaoItemType {
  @Field(() => Float) aliquota: number;
  @Field(() => Float) tributacaoMensal: number;
  @Field(() => Float) tributacaoAnual: number;
}

@ObjectType()
class SimulacaoRegimesType {
  @Field(() => Float) rbr12: number;
  @Field(() => Float) receitaMensal: number;
  @Field(() => SimplesSimulacaoItemType) simplesNacional: SimplesSimulacaoItemType;
  @Field(() => RegimeSimulacaoItemType) lucroPresumido: RegimeSimulacaoItemType;
  @Field(() => RegimeSimulacaoItemType) lucroReal: RegimeSimulacaoItemType;
  @Field() melhorRegime: string;
  @Field() economiaMensal: string;
}

@Resolver()
export class SimplesNacionalResolver {
  constructor(private readonly service: SimplesNacionalService) {}

  @Query(() => [SimplesApuracaoType])
  async listarApuracoesSimples(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarApuracoes(companyId);
  }

  @Mutation(() => SimplesApuracaoType)
  async calcularPGDAS(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.service.calcularPGDAS(companyId, referenceMonth);
  }

  @Mutation(() => SimplesApuracaoType)
  async gerarDASSimples(@Args('apuracaoId', { type: () => ID }) apuracaoId: string) {
    return this.service.gerarDAS(apuracaoId);
  }

  @Query(() => SimulacaoRegimesType)
  async simularRegimesTributarios(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.service.simularRegimes(companyId, referenceMonth);
  }
}
