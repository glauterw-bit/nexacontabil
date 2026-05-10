import { Resolver, Query, Mutation, Args, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { AberturaEmpresaService } from './abertura-empresa.service';

@ObjectType()
export class AberturaEmpresaType {
  @Field() id: string;
  @Field() escritorioId: string;
  @Field() nomeEmpresarial: string;
  @Field({ nullable: true }) nomeFantasia?: string;
  @Field() tipoEmpresa: string;
  @Field() objetoSocial: string;
  @Field() cnaePrincipal: string;
  @Field({ nullable: true }) cnaesSecundarios?: string;
  @Field(() => Float) capitalSocial: number;
  @Field() socios: string;
  @Field() enderecoComercial: string;
  @Field() municipio: string;
  @Field() uf: string;
  @Field() status: string;
  @Field() contratoSocialGerado: boolean;
  @Field() dbeGerado: boolean;
  @Field({ nullable: true }) dbeNumero?: string;
  @Field() cnpjEmitido: boolean;
  @Field({ nullable: true }) cnpjNumero?: string;
  @Field() inscricaoEstadual: boolean;
  @Field() inscricaoMunicipal: boolean;
  @Field() alvara: boolean;
  @Field({ nullable: true }) dtInicioAtividades?: Date;
  @Field({ nullable: true }) dtCnpj?: Date;
  @Field({ nullable: true }) observacoes?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class AberturaResumoType {
  @Field(() => Int) total: number;
  @Field(() => Int) emDocumentacao: number;
  @Field(() => Int) emProtocolo: number;
  @Field(() => Int) concluidas: number;
  @Field(() => Int) canceladas: number;
}

@ObjectType()
export class ChecklistItemType {
  @Field() item: string;
  @Field() concluido: boolean;
}

@Resolver()
export class AberturaEmpresaResolver {
  constructor(private service: AberturaEmpresaService) {}

  @Query(() => [AberturaEmpresaType])
  async aberturas(@Args('escritorioId') escritorioId: string) {
    return this.service.listar(escritorioId);
  }

  @Query(() => AberturaResumoType)
  async aberturasResumo(@Args('escritorioId') escritorioId: string) {
    return this.service.resumo(escritorioId);
  }

  @Query(() => [ChecklistItemType])
  async checklistAbertura(@Args('tipoEmpresa') tipoEmpresa: string) {
    return this.service.gerarChecklist(tipoEmpresa);
  }

  @Mutation(() => AberturaEmpresaType)
  async criarAbertura(
    @Args('escritorioId') escritorioId: string,
    @Args('nomeEmpresarial') nomeEmpresarial: string,
    @Args('tipoEmpresa') tipoEmpresa: string,
    @Args('objetoSocial') objetoSocial: string,
    @Args('cnaePrincipal') cnaePrincipal: string,
    @Args('socios') socios: string,
    @Args('enderecoComercial') enderecoComercial: string,
    @Args('municipio') municipio: string,
    @Args('uf') uf: string,
    @Args('capitalSocial', { type: () => Float, nullable: true }) capitalSocial?: number,
    @Args('nomeFantasia', { nullable: true }) nomeFantasia?: string,
    @Args('observacoes', { nullable: true }) observacoes?: string,
  ) {
    return this.service.criar(escritorioId, {
      nomeEmpresarial, nomeFantasia, tipoEmpresa, objetoSocial,
      cnaePrincipal, socios, enderecoComercial, municipio, uf,
      capitalSocial: capitalSocial || 1000, observacoes,
    });
  }

  @Mutation(() => AberturaEmpresaType)
  async avancarStatusAbertura(@Args('id') id: string, @Args('status') status: string) {
    return this.service.avancarStatus(id, status);
  }

  @Mutation(() => AberturaEmpresaType)
  async atualizarChecklistAbertura(
    @Args('id') id: string,
    @Args('contratoSocialGerado', { nullable: true }) contratoSocialGerado?: boolean,
    @Args('dbeGerado', { nullable: true }) dbeGerado?: boolean,
    @Args('cnpjEmitido', { nullable: true }) cnpjEmitido?: boolean,
    @Args('cnpjNumero', { nullable: true }) cnpjNumero?: string,
    @Args('alvara', { nullable: true }) alvara?: boolean,
  ) {
    return this.service.atualizarChecklist(id, { contratoSocialGerado, dbeGerado, cnpjEmitido, cnpjNumero, alvara });
  }
}
