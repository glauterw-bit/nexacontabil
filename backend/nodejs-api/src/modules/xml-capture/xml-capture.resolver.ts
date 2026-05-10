import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float } from '@nestjs/graphql';
import { XmlCaptureService } from './xml-capture.service';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
class XmlCaptureType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() origem: string;
  @Field({ nullable: true }) fileName?: string;
  @Field() tipoDoc: string;
  @Field() status: string;
  @Field({ nullable: true }) chaveNfe?: string;
  @Field({ nullable: true }) cnpjEmitente?: string;
  @Field({ nullable: true }) dataEmissao?: Date;
  @Field(() => Float, { nullable: true }) valorTotal?: number;
  @Field({ nullable: true }) numero?: string;
  @Field({ nullable: true }) serie?: string;
  @Field() createdAt: Date;
}

@Resolver()
export class XmlCaptureResolver {
  constructor(private readonly service: XmlCaptureService) {}

  @Query(() => [XmlCaptureType])
  async listarXmlsCapturados(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('tipoDoc', { nullable: true }) tipoDoc?: string,
  ) {
    return this.service.listarCaptures(companyId, tipoDoc);
  }

  @Mutation(() => XmlCaptureType)
  async processarXmlNfe(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('xmlContent') xmlContent: string,
    @Args('origem') origem: string,
    @Args('fileName', { nullable: true }) fileName?: string,
  ) {
    return this.service.processarXml(companyId, xmlContent, origem, fileName);
  }

  @Mutation(() => GraphQLJSON)
  async manifestarNfe(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('chaveNfe') chaveNfe: string,
    @Args('tipoManifestacao') tipoManifestacao: string,
  ) {
    return this.service.manifestarNfe(chaveNfe, tipoManifestacao, companyId);
  }

  @Query(() => GraphQLJSON)
  async consultarNfeSefaz(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('chave') chave: string,
  ) {
    return this.service.consultarNfeSefaz(chave, companyId);
  }
}
