import { Resolver, Query, Mutation, Args, ObjectType, Field, Int } from '@nestjs/graphql';
import { ComunicadosService } from './comunicados.service';

@ObjectType()
export class ComunicadoType {
  @Field() id: string;
  @Field() escritorioId: string;
  @Field() titulo: string;
  @Field() corpo: string;
  @Field() tipo: string;
  @Field() canal: string;
  @Field() destinatarios: string;
  @Field({ nullable: true }) agendadoPara?: Date;
  @Field({ nullable: true }) enviadoEm?: Date;
  @Field() status: string;
  @Field(() => Int) lidos: number;
  @Field(() => Int) totalEnviados: number;
  @Field() createdAt: Date;
}

@ObjectType()
export class ComunicadoResumoType {
  @Field(() => Int) total: number;
  @Field(() => Int) enviados: number;
  @Field(() => Int) rascunhos: number;
  @Field(() => Int) agendados: number;
  @Field(() => Int) totalAlcancados: number;
}

@Resolver()
export class ComunicadosResolver {
  constructor(private service: ComunicadosService) {}

  @Query(() => [ComunicadoType])
  async comunicados(@Args('escritorioId') escritorioId: string) {
    return this.service.listar(escritorioId);
  }

  @Query(() => ComunicadoResumoType)
  async comunicadosResumo(@Args('escritorioId') escritorioId: string) {
    return this.service.resumo(escritorioId);
  }

  @Mutation(() => ComunicadoType)
  async criarComunicado(
    @Args('escritorioId') escritorioId: string,
    @Args('titulo') titulo: string,
    @Args('corpo') corpo: string,
    @Args('tipo', { nullable: true }) tipo?: string,
    @Args('canal', { nullable: true }) canal?: string,
    @Args('destinatarios', { nullable: true }) destinatarios?: string,
    @Args('agendadoPara', { nullable: true }) agendadoPara?: string,
  ) {
    return this.service.criar(escritorioId, { titulo, corpo, tipo, canal, destinatarios, agendadoPara: agendadoPara ? new Date(agendadoPara) : undefined });
  }

  @Mutation(() => ComunicadoType)
  async enviarComunicado(@Args('id') id: string) {
    return this.service.enviar(id);
  }

  @Mutation(() => ComunicadoType)
  async cancelarComunicado(@Args('id') id: string) {
    return this.service.cancelar(id);
  }
}
