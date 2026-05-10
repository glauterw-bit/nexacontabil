import { Resolver, Query, Mutation, Args, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { CrmClientesService } from './crm-clientes.service';

@ObjectType()
export class CrmClienteType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() nome: string;
  @Field({ nullable: true }) cnpjCpf?: string;
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) telefone?: string;
  @Field({ nullable: true }) segmento?: string;
  @Field({ nullable: true }) origem?: string;
  @Field() stage: string;
  @Field(() => Float, { nullable: true }) valorEstimado?: number;
  @Field(() => Int) probabilidade: number;
  @Field({ nullable: true }) responsavel?: string;
  @Field({ nullable: true }) ultimoContato?: Date;
  @Field({ nullable: true }) proximoContato?: Date;
  @Field({ nullable: true }) observacoes?: string;
  @Field({ nullable: true }) tags?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class CrmStageType {
  @Field() stage: string;
  @Field(() => [CrmClienteType]) clientes: CrmClienteType[];
  @Field(() => Float) total: number;
}

@ObjectType()
export class CrmPipelineType {
  @Field(() => [CrmStageType]) pipeline: CrmStageType[];
  @Field(() => Int) total: number;
}

@ObjectType()
export class CrmMetricasType {
  @Field(() => Int) totalLeads: number;
  @Field(() => Int) totalClientes: number;
  @Field() taxaConversao: string;
  @Field(() => Float) receitaMensalEstimada: number;
  @Field(() => Float) pipelineEstimado: number;
}

@Resolver()
export class CrmClientesResolver {
  constructor(private service: CrmClientesService) {}

  @Query(() => CrmPipelineType)
  async crmPipeline(@Args('companyId') companyId: string) {
    return this.service.listarPipeline(companyId);
  }

  @Query(() => CrmMetricasType)
  async crmMetricas(@Args('companyId') companyId: string) {
    return this.service.metricas(companyId);
  }

  @Mutation(() => CrmClienteType)
  async criarCrmCliente(
    @Args('companyId') companyId: string,
    @Args('nome') nome: string,
    @Args('cnpjCpf', { nullable: true }) cnpjCpf?: string,
    @Args('email', { nullable: true }) email?: string,
    @Args('telefone', { nullable: true }) telefone?: string,
    @Args('segmento', { nullable: true }) segmento?: string,
    @Args('origem', { nullable: true }) origem?: string,
    @Args('valorEstimado', { type: () => Float, nullable: true }) valorEstimado?: number,
    @Args('observacoes', { nullable: true }) observacoes?: string,
  ) {
    return this.service.criar(companyId, { nome, cnpjCpf, email, telefone, segmento, origem, valorEstimado, observacoes });
  }

  @Mutation(() => CrmClienteType)
  async avancarStageCrm(@Args('id') id: string, @Args('stage') stage: string) {
    return this.service.avancarStage(id, stage);
  }

  @Mutation(() => CrmClienteType)
  async registrarContatoCrm(@Args('id') id: string, @Args('proximoContato', { nullable: true }) proximoContato?: string) {
    return this.service.registrarContato(id, proximoContato ? new Date(proximoContato) : undefined);
  }

  @Mutation(() => CrmClienteType)
  async atualizarCrmCliente(
    @Args('id') id: string,
    @Args('nome', { nullable: true }) nome?: string,
    @Args('email', { nullable: true }) email?: string,
    @Args('telefone', { nullable: true }) telefone?: string,
    @Args('observacoes', { nullable: true }) observacoes?: string,
    @Args('valorEstimado', { type: () => Float, nullable: true }) valorEstimado?: number,
  ) {
    return this.service.atualizar(id, { nome, email, telefone, observacoes, valorEstimado });
  }
}
