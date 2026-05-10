import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { PatrimonioService } from './patrimonio.service';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
class AtivoImobilizadoType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() descricao: string;
  @Field() categoria: string;
  @Field() dataAquisicao: Date;
  @Field(() => Float) valorAquisicao: number;
  @Field(() => Float) valorResidual: number;
  @Field(() => Float) taxaDepreciacaoAnual: number;
  @Field(() => Int) vidaUtilAnos: number;
  @Field({ nullable: true }) numeroPatrimonio?: string;
  @Field({ nullable: true }) fornecedor?: string;
  @Field({ nullable: true }) notaFiscal?: string;
  @Field({ nullable: true }) localizacao?: string;
  @Field({ nullable: true }) observacoes?: string;
  @Field() status: string;
  @Field({ nullable: true }) dataBaixa?: Date;
  @Field({ nullable: true }) motivoBaixa?: string;
  @Field(() => Float, { nullable: true }) valorVenda?: number;
  @Field(() => Float, { nullable: true }) resultadoBaixa?: number;
}

@ObjectType()
class DepreciacaoType {
  @Field(() => ID) id: string;
  @Field() ativoId: string;
  @Field() companyId: string;
  @Field() competencia: string;
  @Field(() => Float) valorDepreciacao: number;
  @Field(() => Float) depreciacaoAcumulada: number;
  @Field(() => Float) valorAtual: number;
}

@Resolver()
export class PatrimonioResolver {
  constructor(private readonly service: PatrimonioService) {}

  @Query(() => [AtivoImobilizadoType])
  async listarAtivos(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarAtivos(companyId);
  }

  @Query(() => GraphQLJSON)
  async relatorioPatrimonio(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.relatorioPatrimonio(companyId);
  }

  @Mutation(() => AtivoImobilizadoType)
  async cadastrarAtivo(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('descricao') descricao: string,
    @Args('categoria') categoria: string,
    @Args('dataAquisicao') dataAquisicao: string,
    @Args('valorAquisicao', { type: () => Float }) valorAquisicao: number,
    @Args('vidaUtilAnos', { type: () => Int, nullable: true }) vidaUtilAnos?: number,
    @Args('fornecedor', { nullable: true }) fornecedor?: string,
    @Args('notaFiscal', { nullable: true }) notaFiscal?: string,
    @Args('localizacao', { nullable: true }) localizacao?: string,
  ) {
    return this.service.cadastrarAtivo({
      companyId, descricao, categoria, dataAquisicao, valorAquisicao,
      vidaUtilAnos, fornecedor, notaFiscal, localizacao,
    });
  }

  @Mutation(() => [DepreciacaoType])
  async calcularDepreciacaoMensal(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('competencia') competencia: string,
  ) {
    return this.service.calcularDepreciacao(companyId, competencia);
  }

  @Mutation(() => AtivoImobilizadoType)
  async baixarAtivo(
    @Args('ativoId', { type: () => ID }) ativoId: string,
    @Args('motivo') motivo: string,
    @Args('valorVenda', { type: () => Float, nullable: true }) valorVenda?: number,
  ) {
    return this.service.baixarAtivo(ativoId, motivo, valorVenda);
  }
}
