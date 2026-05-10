import { Resolver, Query, Mutation, Args, ObjectType, Field, Float } from '@nestjs/graphql';
import { MeiService } from './mei.service';

@ObjectType()
export class MeiApuracaoType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() competencia: string;
  @Field() tipo: string;
  @Field(() => Float) receitaComercio: number;
  @Field(() => Float) receitaServicos: number;
  @Field(() => Float) receitaTotal: number;
  @Field(() => Float) limiteAnual: number;
  @Field(() => Float) percentualUsado: number;
  @Field(() => Float) dasValor: number;
  @Field(() => Float) dasInss: number;
  @Field(() => Float) dasIss: number;
  @Field(() => Float) dasIcms: number;
  @Field() status: string;
  @Field({ nullable: true }) dataPagamento?: Date;
  @Field({ nullable: true }) codigoBarras?: string;
  @Field() dasnEnviado: boolean;
  @Field({ nullable: true }) dasnRecibo?: string;
  @Field() createdAt: Date;
}

@ObjectType()
export class MeiResumoType {
  @Field(() => Float) receitaAnual: number;
  @Field() percentualUsado: string;
  @Field(() => Float) limiteRestante: number;
  @Field(() => Float) dasPago: number;
  @Field(() => Float) dasPendente: number;
  @Field() emRisco: boolean;
}

@Resolver()
export class MeiResolver {
  constructor(private service: MeiService) {}

  @Query(() => [MeiApuracaoType])
  async meiApuracoes(@Args('companyId') companyId: string) {
    return this.service.listar(companyId);
  }

  @Query(() => MeiResumoType)
  async meiResumo(@Args('companyId') companyId: string) {
    return this.service.resumo(companyId);
  }

  @Mutation(() => MeiApuracaoType)
  async calcularDasMei(
    @Args('companyId') companyId: string,
    @Args('competencia') competencia: string,
    @Args('receitaComercio', { type: () => Float }) receitaComercio: number,
    @Args('receitaServicos', { type: () => Float }) receitaServicos: number,
  ) {
    return this.service.calcularDAS(companyId, competencia, receitaComercio, receitaServicos);
  }

  @Mutation(() => MeiApuracaoType)
  async pagarDasMei(@Args('id') id: string) {
    return this.service.registrarPagamento(id);
  }

  @Mutation(() => MeiApuracaoType)
  async gerarDasnMei(@Args('companyId') companyId: string, @Args('anoBase') anoBase: string) {
    return this.service.dasn(companyId, anoBase);
  }
}
