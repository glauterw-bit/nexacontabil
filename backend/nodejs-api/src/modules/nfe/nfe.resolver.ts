import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { NfeService } from './nfe.service';

// ─── ObjectTypes ───────────────────────────────────────────────────────────

@ObjectType()
export class FiscalNoteType {
  @Field(() => ID) id: string;
  @Field() companyId: string;
  @Field() type: string;
  @Field() status: string;
  @Field(() => Int, { nullable: true }) number?: number;
  @Field({ nullable: true }) series?: string;
  @Field({ nullable: true }) accessKey?: string;
  @Field({ nullable: true }) protocolNumber?: string;
  @Field({ nullable: true }) xmlContent?: string;
  @Field({ nullable: true }) pdfUrl?: string;
  @Field({ nullable: true }) issueDate?: Date;
  @Field() recipientName: string;
  @Field() recipientCnpjCpf: string;
  @Field({ nullable: true }) recipientEmail?: string;
  @Field({ nullable: true }) recipientUf?: string;
  @Field({ nullable: true }) recipientIe?: string;
  @Field({ nullable: true }) cfop?: string;
  @Field({ nullable: true }) natOp?: string;
  @Field(() => GraphQLJSON) items: any;
  @Field(() => Float) totalValue: number;
  @Field(() => GraphQLJSON) totalTaxes: any;
  @Field(() => Float) totalIcms: number;
  @Field(() => Float) totalIpi: number;
  @Field(() => Float) totalPis: number;
  @Field(() => Float) totalCofins: number;
  @Field(() => Float) totalFrete: number;
  @Field({ nullable: true }) modalidadeFrete?: string;
  @Field({ nullable: true }) transportadorNome?: string;
  @Field({ nullable: true }) transportadorCnpj?: string;
  @Field({ nullable: true }) infAdic?: string;
  @Field({ nullable: true }) nfeioId?: string;
  @Field({ nullable: true }) rejectionCode?: string;
  @Field({ nullable: true }) rejectionMessage?: string;
  @Field({ nullable: true }) canceledAt?: Date;
  @Field({ nullable: true }) cancelReason?: string;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType()
export class NFeListResult {
  @Field(() => [FiscalNoteType]) items: FiscalNoteType[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) limit: number;
  @Field(() => Int) pages: number;
}

// ─── InputTypes ────────────────────────────────────────────────────────────

@InputType()
export class EnderecoInput {
  @Field() logradouro: string;
  @Field() numero: string;
  @Field({ nullable: true }) complemento?: string;
  @Field() bairro: string;
  @Field() municipio: string;
  @Field() uf: string;
  @Field() cep: string;
  @Field({ nullable: true }) codigoMunicipio?: string;
}

@InputType()
export class DestinatarioNFeInput {
  @Field() nome: string;
  @Field() cnpjCpf: string;
  @Field({ nullable: true }) ie?: string;
  @Field(() => EnderecoInput) endereco: EnderecoInput;
  @Field({ nullable: true }) email?: string;
}

@InputType()
export class ItemNFeInput {
  @Field() descricao: string;
  @Field() ncm: string;
  @Field() cfop: string;
  @Field() unidade: string;
  @Field(() => Float) quantidade: number;
  @Field(() => Float) valorUnitario: number;
  @Field(() => Float) valorTotal: number;
  @Field({ nullable: true }) cstIcms?: string;
  @Field(() => Float, { nullable: true }) aliquotaIcms?: number;
  @Field({ nullable: true }) cstIpi?: string;
  @Field(() => Float, { nullable: true }) aliquotaIpi?: number;
  @Field({ nullable: true }) cstPis?: string;
  @Field(() => Float, { nullable: true }) aliquotaPis?: number;
  @Field({ nullable: true }) cstCofins?: string;
  @Field(() => Float, { nullable: true }) aliquotaCofins?: number;
  @Field(() => Float, { nullable: true }) desconto?: number;
}

@InputType()
export class FreteNFeInput {
  @Field() modalidade: string;
  @Field(() => Float, { nullable: true }) valor?: number;
  @Field({ nullable: true }) transportadorNome?: string;
  @Field({ nullable: true }) transportadorCnpj?: string;
  @Field({ nullable: true }) placa?: string;
  @Field({ nullable: true }) uf?: string;
}

@InputType()
export class PagamentoNFeInput {
  @Field() forma: string;
  @Field(() => Float) valor: number;
}

@InputType()
export class EmitirNFeInput {
  @Field() companyId: string;
  @Field() naturezaOperacao: string;
  @Field(() => DestinatarioNFeInput) destinatario: DestinatarioNFeInput;
  @Field(() => [ItemNFeInput]) items: ItemNFeInput[];
  @Field(() => FreteNFeInput, { nullable: true }) frete?: FreteNFeInput;
  @Field(() => [PagamentoNFeInput]) pagamento: PagamentoNFeInput[];
  @Field({ nullable: true }) infAdic?: string;
}

// ─── Resolver ──────────────────────────────────────────────────────────────

@Resolver(() => FiscalNoteType)
export class NfeResolver {
  constructor(private readonly nfeService: NfeService) {}

  @Query(() => NFeListResult)
  async listarNFes(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('page', { type: () => Int, nullable: true }) page?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<NFeListResult> {
    const result = await this.nfeService.listarNFes(companyId, status, page, limit);
    return {
      ...result,
      items: result.items.map(item => ({
        ...item,
        number: item.number ?? undefined,
      })) as FiscalNoteType[],
    };
  }

  @Query(() => FiscalNoteType)
  async consultarNFe(@Args('id', { type: () => ID }) id: string): Promise<FiscalNoteType> {
    return this.nfeService.consultarNFe(id) as Promise<FiscalNoteType>;
  }

  @Query(() => String)
  async baixarXmlNFe(@Args('id', { type: () => ID }) id: string): Promise<string> {
    return this.nfeService.baixarXml(id);
  }

  @Query(() => String)
  async gerarDanfe(@Args('id', { type: () => ID }) id: string): Promise<string> {
    return this.nfeService.gerarDanfe(id);
  }

  @Mutation(() => FiscalNoteType)
  async emitirNFe(@Args('input') input: EmitirNFeInput): Promise<FiscalNoteType> {
    return this.nfeService.emitirNFe(input) as Promise<FiscalNoteType>;
  }

  @Mutation(() => FiscalNoteType)
  async cancelarNFe(
    @Args('id', { type: () => ID }) id: string,
    @Args('motivo') motivo: string,
  ): Promise<FiscalNoteType> {
    return this.nfeService.cancelarNFe(id, motivo) as Promise<FiscalNoteType>;
  }
}
