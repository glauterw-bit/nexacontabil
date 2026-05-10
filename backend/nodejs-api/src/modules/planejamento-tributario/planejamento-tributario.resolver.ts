import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { PlanejamentoTributarioService } from './planejamento-tributario.service';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
class TaxSimulationType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field(() => Int) anoBase: number;
  @Field(() => Float) receitaTotal: number;
  @Field(() => Float) despesaTotal: number;
  @Field(() => Float) lucroLiquido: number;
  @Field(() => Float) simplesTotal: number;
  @Field(() => Float) lpTotal: number;
  @Field(() => Float) lrTotal: number;
  @Field() melhorRegime: string;
  @Field(() => Float) economiaMaxima: number;
  @Field() createdAt: Date;
}

@Resolver()
export class PlanejamentoTributarioResolver {
  constructor(private readonly service: PlanejamentoTributarioService) {}

  @Query(() => [TaxSimulationType])
  async listarSimulacoesTributarias(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarSimulacoes(companyId);
  }

  @Query(() => GraphQLJSON)
  async relatorioSimulacao(@Args('simulacaoId', { type: () => ID }) simulacaoId: string) {
    return this.service.gerarRelatorio(simulacaoId);
  }

  @Mutation(() => GraphQLJSON)
  async analisarRegimesTributarios(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('anoBase', { type: () => Int }) anoBase: number,
  ) {
    return this.service.analisarRegimes(companyId, anoBase);
  }
}
