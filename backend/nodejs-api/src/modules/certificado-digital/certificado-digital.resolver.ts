import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Int } from '@nestjs/graphql';
import { CertificadoDigitalService } from './certificado-digital.service';

// ─── ObjectTypes ───────────────────────────────────────────────────────────

@ObjectType()
export class CertificadoType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() nome: string;
  @Field() tipo: string;
  @Field() cnpjCpf: string;
  @Field() dataEmissao: Date;
  @Field() dataValidade: Date;
  @Field({ nullable: true }) emissor?: string;
  @Field({ nullable: true }) serialNumber?: string;
  @Field({ nullable: true }) thumbprint?: string;
  @Field(() => Boolean) active: boolean;
  @Field(() => Int) alertaDias: number;
  @Field(() => Int, { nullable: true }) diasParaVencer?: number;
  @Field(() => Boolean, { nullable: true }) expirado?: boolean;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class ValidadeResultType {
  @Field() companyId: string;
  @Field(() => Int) diasRestantes: number;
  @Field() dataValidade: Date;
  @Field(() => Boolean) expirado: boolean;
  @Field(() => Boolean) alertar: boolean;
  @Field(() => [CertificadoType]) certificados: CertificadoType[];
}

// ─── Resolver ──────────────────────────────────────────────────────────────

@Resolver(() => CertificadoType)
export class CertificadoDigitalResolver {
  constructor(private readonly certificadoDigitalService: CertificadoDigitalService) {}

  @Query(() => [CertificadoType])
  async listarCertificados(
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<CertificadoType[]> {
    return this.certificadoDigitalService.listarCertificados(companyId) as Promise<CertificadoType[]>;
  }

  @Query(() => ValidadeResultType)
  async verificarValidade(
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<ValidadeResultType> {
    const result = await this.certificadoDigitalService.verificarValidade(companyId);
    return result as ValidadeResultType;
  }

  @Mutation(() => CertificadoType)
  async salvarCertificadoA1(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('pfxBase64') pfxBase64: string,
    @Args('senha') senha: string,
    @Args('nome') nome: string,
  ): Promise<CertificadoType> {
    return this.certificadoDigitalService.salvarCertificadoA1(
      companyId,
      pfxBase64,
      senha,
      nome,
    ) as Promise<CertificadoType>;
  }

  @Mutation(() => Boolean)
  async removerCertificado(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.certificadoDigitalService.removerCertificado(id);
  }

  @Mutation(() => String)
  async assinarXml(
    @Args('xmlContent') xmlContent: string,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<string> {
    return this.certificadoDigitalService.assinarXml(xmlContent, companyId);
  }

  @Mutation(() => CertificadoType)
  async configurarBirdID(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('clientId') clientId: string,
    @Args('authCode') authCode: string,
  ): Promise<CertificadoType> {
    return this.certificadoDigitalService.configurarBirdID(
      companyId,
      clientId,
      authCode,
    ) as Promise<CertificadoType>;
  }

  @Mutation(() => String)
  async assinarComBirdID(
    @Args('hash') hash: string,
    @Args('companyId', { type: () => ID }) companyId: string,
  ): Promise<string> {
    return this.certificadoDigitalService.assinarComBirdID(hash, companyId);
  }
}
