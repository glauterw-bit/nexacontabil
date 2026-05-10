import { Resolver, Query, Mutation, Args, ObjectType, Field, Int } from '@nestjs/graphql';
import { TarefasService } from './tarefas.service';

@ObjectType()
export class TarefaType {
  @Field() id: string;
  @Field() companyId: string;
  @Field() titulo: string;
  @Field({ nullable: true }) descricao?: string;
  @Field() tipo: string;
  @Field() status: string;
  @Field() prioridade: string;
  @Field({ nullable: true }) responsavel?: string;
  @Field({ nullable: true }) prazo?: Date;
  @Field({ nullable: true }) concluidaEm?: Date;
  @Field({ nullable: true }) tags?: string;
  @Field({ nullable: true }) checklist?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class KanbanColunaType {
  @Field() status: string;
  @Field() label: string;
  @Field(() => [TarefaType]) tarefas: TarefaType[];
}

@ObjectType()
export class TarefaResumoType {
  @Field(() => Int) total: number;
  @Field(() => Int) backlog: number;
  @Field(() => Int) emAndamento: number;
  @Field(() => Int) concluidas: number;
  @Field(() => Int) atrasadas: number;
}

@Resolver()
export class TarefasResolver {
  constructor(private service: TarefasService) {}

  @Query(() => [KanbanColunaType])
  async tarefasKanban(@Args('companyId') companyId: string) {
    return this.service.listarKanban(companyId);
  }

  @Query(() => TarefaResumoType)
  async tarefasResumo(@Args('companyId') companyId: string) {
    return this.service.resumo(companyId);
  }

  @Query(() => [TarefaType])
  async tarefasVencendoHoje(@Args('companyId') companyId: string) {
    return this.service.vencendoHoje(companyId);
  }

  @Mutation(() => TarefaType)
  async criarTarefa(
    @Args('companyId') companyId: string,
    @Args('titulo') titulo: string,
    @Args('descricao', { nullable: true }) descricao?: string,
    @Args('tipo', { nullable: true }) tipo?: string,
    @Args('prioridade', { nullable: true }) prioridade?: string,
    @Args('responsavel', { nullable: true }) responsavel?: string,
    @Args('prazo', { nullable: true }) prazo?: string,
    @Args('tags', { nullable: true }) tags?: string,
  ) {
    return this.service.criar(companyId, { titulo, descricao, tipo, prioridade, responsavel, prazo: prazo ? new Date(prazo) : undefined, tags });
  }

  @Mutation(() => TarefaType)
  async moverTarefa(@Args('id') id: string, @Args('status') status: string) {
    return this.service.moverColuna(id, status);
  }

  @Mutation(() => TarefaType)
  async atualizarTarefa(
    @Args('id') id: string,
    @Args('titulo', { nullable: true }) titulo?: string,
    @Args('descricao', { nullable: true }) descricao?: string,
    @Args('prioridade', { nullable: true }) prioridade?: string,
    @Args('checklist', { nullable: true }) checklist?: string,
  ) {
    return this.service.atualizar(id, { titulo, descricao, prioridade, checklist });
  }
}
