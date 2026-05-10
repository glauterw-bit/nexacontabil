import { Resolver, Query, Mutation, Args, ID, ObjectType, Field } from '@nestjs/graphql';
import { CertidoesService } from './certidoes.service';

@ObjectType()
class CertidaoType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() tipo: string;
  @Field() cnpj: string;
  @Field() status: string;
  @Field({ nullable: true }) numeroControle?: string;
  @Field() dataEmissao: Date;
  @Field({ nullable: true }) dataValidade?: Date;
  @Field() orgaoEmissor: string;
  @Field({ nullable: true }) conteudo?: string;
  @Field({ nullable: true }) url?: string;
}

@ObjectType()
class VencimentosCertidoesType {
  @Field(() => [CertidaoType]) vencendo: CertidaoType[];
  @Field(() => [CertidaoType]) vencidas: CertidaoType[];
}

@Resolver()
export class CertidoesResolver {
  constructor(private readonly service: CertidoesService) {}

  @Query(() => [CertidaoType])
  async listarCertidoes(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarCertidoes(companyId);
  }

  @Query(() => VencimentosCertidoesType)
  async verificarVencimentosCertidoes(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.verificarVencimentos(companyId);
  }

  @Mutation(() => CertidaoType)
  async solicitarCertidao(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('tipo') tipo: string,
  ) {
    return this.service.solicitarCertidao(companyId, tipo);
  }
}
