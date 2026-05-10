import { Resolver, Query, Mutation, Args, ObjectType, Field, Int } from '@nestjs/graphql';
import { NotificationsService } from './notifications.service';

@ObjectType()
export class NotificationType {
  @Field() id: string;
  @Field() companyId: string;
  @Field({ nullable: true }) userId?: string;
  @Field() tipo: string;
  @Field() titulo: string;
  @Field() corpo: string;
  @Field({ nullable: true }) link?: string;
  @Field() lida: boolean;
  @Field({ nullable: true }) lidaEm?: Date;
  @Field() createdAt: Date;
}

@ObjectType()
export class AlertasGeradosType {
  @Field(() => Int) criadas: number;
}

@Resolver()
export class NotificationsResolver {
  constructor(private service: NotificationsService) {}

  @Query(() => [NotificationType])
  async notifications(@Args('companyId') companyId: string) {
    return this.service.listar(companyId);
  }

  @Query(() => Int)
  async notificacoesNaoLidas(@Args('companyId') companyId: string) {
    return this.service.naoLidas(companyId);
  }

  @Mutation(() => NotificationType)
  async marcarNotificacaoLida(@Args('id') id: string) {
    return this.service.marcarLida(id);
  }

  @Mutation(() => AlertasGeradosType)
  async marcarTodasNotificacoesLidas(@Args('companyId') companyId: string) {
    return this.service.marcarTodasLidas(companyId);
  }

  @Mutation(() => AlertasGeradosType)
  async gerarAlertas(@Args('companyId') companyId: string) {
    return this.service.gerarAlertas(companyId);
  }
}
