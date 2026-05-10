import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { NfseService } from './nfse.service';

// ─── ObjectTypes ───────────────────────────────────────────────────────────

@ObjectType()
export class NfseType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() status: string;
  @Field(() => Int, { nullable: true }) numero?: number;
  @Field({ nullable: true }) codigoVerificacao?: string;
  @Field() rpsNumero: string;
  @Field() rpsSerie: string;
  @Field() dataEmissao: Date;
  @Field() competencia: string;
  @Field() tomadorNome: string;
  @Field() tomadorCnpjCpf: string;
  @Field({ nullable: true }) tomadorEmail?: string;
  @Field({ nullable: true }) tomadorEndereco?: string;
  @Field({ nullable: true }) tomadorMunicipio?: string;
  @Field({ nullable: true }) tomadorUf?: string;
  @Field() discriminacao: string;
  @Field({ nullable: true }) codigoServico?: string;
  @Field({ nullable: true }) cnaeServico?: string;
  @Field(() => Float) valorServicos: number;
  @Field(() => Float) valorDeducoes: number;
  @Field(() => Float) valorPis: number;
  @Field(() => Float) valorCofins: number;
  @Field(() => Float) valorInss: number;
  @Field(() => Float) valorIr: number;
  @Field(() => Float) valorCsll: number;
  @Field(() => Boolean) issRetido: boolean;
  @Field(() => Float) valorIss: number;
  @Field(() => Float) aliquotaIss: number;
  @Field(() => Float) valorLiquido: number;
  @Field({ nullable: true }) municipioPrestacao?: string;
  @Field({ nullable: true }) codigoMunicipio?: string;
  @Field({ nullable: true }) xmlContent?: string;
  @Field({ nullable: true }) pdfUrl?: string;
  @Field({ nullable: true }) nfeioId?: string;
  @Field({ nullable: true }) errorMessage?: string;
  @Field({ nullable: true }) canceledAt?: Date;
  @Field({ nullable: true }) cancelReason?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class ImpostoServicoType {
  @Field(() => Float) iss: number;
  @Field(() => Float) pis: number;
  @Field(() => Float) cofins: number;
  @Field(() => Float) inss: number;
  @Field(() => Float) ir: number;
  @Field(() => Float) csll: number;
  @Field(() => Float) totalRetencoes: number;
  @Field(() => Float) valorLiquido: number;
}

@ObjectType()
export class MunicipioType {
  @Field() codigoIbge: string;
  @Field() nome: string;
  @Field() uf: string;
  @Field(() => Float) aliquotaIssMinima: number;
  @Field(() => Float) aliquotaIssMaxima: number;
  @Field(() => Float) aliquotaIssPadrao: number;
  @Field(() => Boolean) integradoNfeio: boolean;
}

// ─── InputTypes ────────────────────────────────────────────────────────────

@InputType()
export class EnderecoNFSeInput {
  @Field({ nullable: true }) logradouro?: string;
  @Field({ nullable: true }) numero?: string;
  @Field({ nullable: true }) complemento?: string;
  @Field({ nullable: true }) bairro?: string;
  @Field({ nullable: true }) municipio?: string;
  @Field({ nullable: true }) uf?: string;
  @Field({ nullable: true }) cep?: string;
}

@InputType()
export class TomadorNFSeInput {
  @Field() nome: string;
  @Field() cnpjCpf: string;
  @Field({ nullable: true }) email?: string;
  @Field(() => EnderecoNFSeInput, { nullable: true }) endereco?: EnderecoNFSeInput;
}

@InputType()
export class ServicoNFSeInput {
  @Field() discriminacao: string;
  @Field() codigoServico: string;
  @Field({ nullable: true }) cnaeServico?: string;
  @Field() municipioPrestacao: string;
  @Field() codigoMunicipio: string;
}

@InputType()
export class ValoresNFSeInput {
  @Field(() => Float) servicos: number;
  @Field(() => Float, { nullable: true }) deducoes?: number;
  @Field(() => Boolean, { nullable: true }) issRetido?: boolean;
  @Field(() => Float, { nullable: true }) aliquotaIss?: number;
}

@InputType()
export class EmitirNFSeInput {
  @Field() companyId: string;
  @Field(() => TomadorNFSeInput) tomador: TomadorNFSeInput;
  @Field(() => ServicoNFSeInput) servico: ServicoNFSeInput;
  @Field(() => ValoresNFSeInput) valores: ValoresNFSeInput;
  @Field() competencia: string;
  @Field(() => Boolean, { nullable: true }) optanteSimplesNacional?: boolean;
}

// ─── Resolver ──────────────────────────────────────────────────────────────

@Resolver(() => NfseType)
export class NfseResolver {
  constructor(private readonly nfseService: NfseService) {}

  @Query(() => [NfseType])
  async listarNFSes(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('competencia', { nullable: true }) competencia?: string,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<NfseType[]> {
    return this.nfseService.listarNFSes(companyId, competencia, status) as Promise<NfseType[]>;
  }

  @Query(() => ImpostoServicoType)
  calcularImpostosServico(
    @Args('valor', { type: () => Float }) valor: number,
    @Args('aliquotaIss', { type: () => Float }) aliquotaIss: number,
    @Args('regime') regime: string,
    @Args('issRetido', { type: () => Boolean, nullable: true }) issRetido?: boolean,
  ): ImpostoServicoType {
    return this.nfseService.calcularImpostosServico(valor, aliquotaIss, regime, issRetido);
  }

  @Query(() => MunicipioType)
  consultarMunicipio(@Args('codigoIbge') codigoIbge: string): MunicipioType {
    return this.nfseService.consultarMunicipio(codigoIbge);
  }

  @Mutation(() => NfseType)
  async emitirNFSe(@Args('input') input: EmitirNFSeInput): Promise<NfseType> {
    return this.nfseService.emitirNFSe(input) as Promise<NfseType>;
  }

  @Mutation(() => NfseType)
  async cancelarNFSe(
    @Args('id', { type: () => ID }) id: string,
    @Args('motivo') motivo: string,
  ): Promise<NfseType> {
    return this.nfseService.cancelarNFSe(id, motivo) as Promise<NfseType>;
  }
}
