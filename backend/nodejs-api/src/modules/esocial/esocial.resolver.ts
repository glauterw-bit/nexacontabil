import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Int } from '@nestjs/graphql';
import { EsocialService } from './esocial.service';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
class EsocialEventType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() tipoEvento: string;
  @Field() grupo: string;
  @Field({ nullable: true }) employeeId?: string;
  @Field({ nullable: true }) referenceMonth?: string;
  @Field() xmlContent: string;
  @Field() status: string;
  @Field({ nullable: true }) loteId?: string;
  @Field({ nullable: true }) nrRecibo?: string;
  @Field({ nullable: true }) errorMessage?: string;
  @Field({ nullable: true }) transmittedAt?: Date;
  @Field({ nullable: true }) processedAt?: Date;
  @Field() createdAt: Date;
}

@ObjectType()
class EsocialDashboardType {
  @Field(() => Int) total: number;
  @Field(() => Int) pendentes: number;
  @Field(() => Int) enviados: number;
  @Field(() => Int) processados: number;
  @Field(() => Int) erros: number;
}

@ObjectType()
class TransmissaoLoteType {
  @Field() loteId: string;
  @Field() nrRecibo: string;
  @Field(() => Int) eventCount: number;
  @Field() status: string;
}

@Resolver()
export class EsocialResolver {
  constructor(private readonly esocialService: EsocialService) {}

  @Query(() => [EsocialEventType])
  async listarEventosEsocial(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('tipoEvento', { nullable: true }) tipoEvento?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('referenceMonth', { nullable: true }) referenceMonth?: string,
  ) {
    return this.esocialService.listarEventos(companyId, tipoEvento, status, referenceMonth);
  }

  @Query(() => EsocialDashboardType)
  async esocialDashboard(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.esocialService.getDashboard(companyId);
  }

  @Mutation(() => EsocialEventType)
  async gerarS1000(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.esocialService.gerarS1000(companyId);
  }

  @Mutation(() => EsocialEventType)
  async gerarS2200(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('companyId', { type: () => ID }) companyId: string,
  ) {
    return this.esocialService.gerarS2200(employeeId, companyId);
  }

  @Mutation(() => EsocialEventType)
  async gerarS2299(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('dataDemissao') dataDemissao: string,
    @Args('tipoDesligamento') tipoDesligamento: string,
  ) {
    return this.esocialService.gerarS2299(employeeId, companyId, new Date(dataDemissao), tipoDesligamento);
  }

  @Mutation(() => EsocialEventType)
  async gerarS1200(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.esocialService.gerarS1200(companyId, referenceMonth);
  }

  @Mutation(() => EsocialEventType)
  async gerarS1299(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('referenceMonth') referenceMonth: string,
  ) {
    return this.esocialService.gerarS1299(companyId, referenceMonth);
  }

  @Mutation(() => EsocialEventType)
  async gerarS2230(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('tipoAfastamento') tipoAfastamento: string,
    @Args('dtInicioAfast') dtInicioAfast: string,
    @Args('dtTermAfast', { nullable: true }) dtTermAfast?: string,
  ) {
    return this.esocialService.gerarS2230(
      employeeId, companyId, tipoAfastamento,
      new Date(dtInicioAfast), dtTermAfast ? new Date(dtTermAfast) : undefined,
    );
  }

  @Mutation(() => TransmissaoLoteType)
  async transmitirLoteEsocial(@Args('eventIds', { type: () => [ID] }) eventIds: string[]) {
    return this.esocialService.transmitirLote(eventIds);
  }

  @Mutation(() => GraphQLJSON)
  async consultarLoteEsocial(@Args('loteId') loteId: string) {
    return this.esocialService.consultarLote(loteId);
  }
}
