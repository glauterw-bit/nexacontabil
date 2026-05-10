import { Resolver, Query, Mutation, Args, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { HonorariosService } from './honorarios.service';

@ObjectType()
export class HonorarioType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() descricao: string;
  @Field() competencia: string;
  @Field(() => Float) valor: number;
  @Field() vencimento: Date;
  @Field() status: string;
  @Field({ nullable: true }) formaPagamento?: string;
  @Field({ nullable: true }) observacao?: string;
  @Field({ nullable: true }) paidAt?: Date;
  @Field() createdAt: Date;
}

@ObjectType()
export class HonorarioResumoType {
  @Field(() => Float) totalPendente: number;
  @Field(() => Float) totalPago: number;
  @Field(() => Float) totalAtrasado: number;
  @Field(() => Int) vencendoHoje: number;
  @Field(() => Int) quantidade: number;
}

@Resolver()
export class HonorariosResolver {
  constructor(private service: HonorariosService) {}

  @Query(() => [HonorarioType])
  async honorarios(@Args('companyId') companyId: string) {
    return this.service.listar(companyId);
  }

  @Query(() => HonorarioResumoType)
  async honorariosResumo(@Args('companyId') companyId: string) {
    return this.service.resumo(companyId);
  }

  @Mutation(() => HonorarioType)
  async criarHonorario(
    @Args('companyId') companyId: string,
    @Args('descricao') descricao: string,
    @Args('competencia') competencia: string,
    @Args('valor', { type: () => Float }) valor: number,
    @Args('vencimento') vencimento: string,
    @Args('formaPagamento', { nullable: true }) formaPagamento?: string,
    @Args('observacao', { nullable: true }) observacao?: string,
  ) {
    return this.service.criar(companyId, { descricao, competencia, valor, vencimento: new Date(vencimento), formaPagamento, observacao });
  }

  @Mutation(() => HonorarioType)
  async pagarHonorario(@Args('id') id: string) {
    return this.service.registrarPagamento(id);
  }

  @Mutation(() => HonorarioType)
  async cancelarHonorario(@Args('id') id: string) {
    return this.service.cancelar(id);
  }

  @Mutation(() => HonorarioType)
  async gerarMensalidade(
    @Args('companyId') companyId: string,
    @Args('competencia') competencia: string,
    @Args('valor', { type: () => Float }) valor: number,
  ) {
    return this.service.gerarMensalidade(companyId, competencia, valor);
  }
}
