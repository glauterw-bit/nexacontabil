import { Resolver, Query, Args } from '@nestjs/graphql';
import { ObjectType, Field, Float, InputType } from '@nestjs/graphql';
import { MotorTributarioService } from './motor-tributario.service';

// ─── ObjectTypes ───────────────────────────────────────────────────────────

@ObjectType()
export class IcmsResultType {
  @Field() cst: string;
  @Field(() => Float) aliquota: number;
  @Field(() => Float) baseCalculo: number;
  @Field(() => Float) valor: number;
  @Field(() => Float) reducaoBc: number;
}

@ObjectType()
export class IpiResultType {
  @Field() cst: string;
  @Field(() => Float) aliquota: number;
  @Field(() => Float) valor: number;
}

@ObjectType()
export class PisCofinsResultType {
  @Field() cst: string;
  @Field(() => Float) aliquota: number;
  @Field(() => Float) valor: number;
}

@ObjectType()
export class ImpostoResultType {
  @Field(() => IcmsResultType) icms: IcmsResultType;
  @Field(() => IpiResultType) ipi: IpiResultType;
  @Field(() => PisCofinsResultType) pis: PisCofinsResultType;
  @Field(() => PisCofinsResultType) cofins: PisCofinsResultType;
  @Field(() => Float) total: number;
}

@ObjectType()
export class NcmInfoType {
  @Field() codigo: string;
  @Field() descricao: string;
  @Field(() => Float) aliquotaIpi: number;
  @Field() unidade: string;
}

@ObjectType()
export class CfopType {
  @Field() codigo: string;
  @Field() descricao: string;
  @Field() tipo: string;
  @Field() aplicacao: string;
}

@ObjectType()
export class DifalResultType {
  @Field(() => Float) aliquotaInterestadual: number;
  @Field(() => Float) aliquotaInterna: number;
  @Field(() => Float) difal: number;
  @Field(() => Float) partilhaDestino: number;
  @Field(() => Float) partilhaOrigem: number;
}

// ─── InputTypes ────────────────────────────────────────────────────────────

@InputType()
export class CalcImpostosInput {
  @Field() ufEmitente: string;
  @Field() ufDestinatario: string;
  @Field() ncm: string;
  @Field() cfop: string;
  @Field(() => Float) valor: number;
  @Field(() => Float) qtd: number;
  @Field() regimeTributario: string;
  @Field({ nullable: true }) tipoContribuinte?: string;
}

// ─── Resolver ──────────────────────────────────────────────────────────────

@Resolver()
export class MotorTributarioResolver {
  constructor(private readonly motorTributarioService: MotorTributarioService) {}

  @Query(() => ImpostoResultType)
  calcularImpostos(@Args('input') input: CalcImpostosInput): ImpostoResultType {
    return this.motorTributarioService.calcularImpostosSaida(input);
  }

  @Query(() => String)
  sugerirCfop(
    @Args('tipoOperacao') tipoOperacao: string,
    @Args('ufOrigem') ufOrigem: string,
    @Args('ufDestino') ufDestino: string,
  ): string {
    return this.motorTributarioService.sugerirCfop(tipoOperacao, ufOrigem, ufDestino);
  }

  @Query(() => NcmInfoType)
  async buscarNcm(@Args('codigo') codigo: string): Promise<NcmInfoType> {
    return this.motorTributarioService.buscarNCM(codigo);
  }

  @Query(() => [CfopType])
  async listarCfops(): Promise<CfopType[]> {
    return this.motorTributarioService.listarCFOPs();
  }

  @Query(() => DifalResultType)
  calcularDifal(
    @Args('ufOrigem') ufOrigem: string,
    @Args('ufDestino') ufDestino: string,
    @Args('valor', { type: () => Float }) valor: number,
    @Args('aliquotaInterna', { type: () => Float }) aliquotaInterna: number,
  ): DifalResultType {
    return this.motorTributarioService.calcularDIFAL(ufOrigem, ufDestino, valor, aliquotaInterna);
  }
}
