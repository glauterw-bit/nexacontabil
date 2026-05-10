import { Resolver, Query, Mutation, Args, ID, ObjectType, Field } from '@nestjs/graphql';
import { PortalClienteService } from './portal-cliente.service';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
class ClientPortalType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field({ nullable: true }) clientName?: string;
  @Field({ nullable: true }) clientEmail?: string;
  @Field() active: boolean;
  @Field({ nullable: true }) lastAccessAt?: Date;
  @Field() createdAt: Date;
}

@ObjectType()
class PortalCriadoType {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) clientName?: string;
  @Field({ nullable: true }) clientEmail?: string;
  @Field() accessToken: string;
  @Field() linkAcesso: string;
  @Field() active: boolean;
}

@ObjectType()
class PortalMessageType {
  @Field(() => ID) id: string;
  @Field() portalId: string;
  @Field() sender: string;
  @Field() message: string;
  @Field({ nullable: true }) readAt?: Date;
  @Field() createdAt: Date;
}

@Resolver()
export class PortalClienteResolver {
  constructor(private readonly service: PortalClienteService) {}

  @Query(() => [ClientPortalType])
  async listarPortaisCliente(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarPortais(companyId);
  }

  @Query(() => [PortalMessageType])
  async listarMensagensPortal(@Args('portalId', { type: () => ID }) portalId: string) {
    return this.service.listarMensagens(portalId);
  }

  @Query(() => GraphQLJSON)
  async listarDocumentosPortalCliente(@Args('portalId', { type: () => ID }) portalId: string) {
    return this.service.listarDocumentosPortal(portalId);
  }

  @Query(() => GraphQLJSON)
  async listarObrigacoesPortal(@Args('portalId', { type: () => ID }) portalId: string) {
    return this.service.listarObrigacoes(portalId);
  }

  @Mutation(() => PortalCriadoType)
  async criarPortalCliente(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('clientName') clientName: string,
    @Args('clientEmail') clientEmail: string,
    @Args('clientPhone', { nullable: true }) clientPhone?: string,
  ) {
    return this.service.criarPortal(companyId, { clientName, clientEmail, clientPhone });
  }

  @Mutation(() => PortalMessageType)
  async enviarMensagemPortal(
    @Args('portalId', { type: () => ID }) portalId: string,
    @Args('conteudo') conteudo: string,
  ) {
    return this.service.enviarMensagem(portalId, conteudo);
  }

  @Mutation(() => PortalMessageType)
  async responderMensagemPortal(
    @Args('mensagemId', { type: () => ID }) mensagemId: string,
    @Args('portalId', { type: () => ID }) portalId: string,
    @Args('resposta') resposta: string,
  ) {
    return this.service.responderMensagem(mensagemId, resposta, portalId);
  }
}
