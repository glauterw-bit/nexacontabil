import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { FeriasRescisaoService } from './ferias-rescisao.service';

@ObjectType()
class FeriasType {
  @Field(() => ID) id: string;
  @Field() employeeId: string;
  @Field() companyId: string;
  @Field() periodoAquisitivo: string;
  @Field() dtInicioGozo: Date;
  @Field() dtFimGozo: Date;
  @Field(() => Int) diasUsufruidos: number;
  @Field(() => Int) diasVendidos: number;
  @Field(() => Float) salarioBase: number;
  @Field(() => Float) tercoConstitucional: number;
  @Field(() => Float) valorVendido: number;
  @Field(() => Float) valorTotal: number;
  @Field(() => Float) inssFerias: number;
  @Field(() => Float) irrfFerias: number;
  @Field(() => Float) valorLiquido: number;
  @Field() status: string;
}

@ObjectType()
class DecimoTerceiroItemType {
  @Field() employeeId: string;
  @Field() employeeNome: string;
  @Field(() => Float) salario: number;
  @Field(() => Int) avosAquisitivos: number;
  @Field(() => Float) totalBruto: number;
  @Field(() => Float) primeiraParcela: number;
  @Field(() => Float) inss: number;
  @Field(() => Float) irrf: number;
  @Field(() => Float) segundaParcela: number;
  @Field(() => Float) totalLiquido: number;
}

@ObjectType()
class RescisaoType {
  @Field(() => ID) id: string;
  @Field() employeeId: string;
  @Field() companyId: string;
  @Field() dataDemissao: Date;
  @Field() tipoRescisao: string;
  @Field(() => Int) mesesTrabalhados: number;
  @Field(() => Int) diasAvisoPrevio: number;
  @Field() avisoPrevio: string;
  @Field(() => Float) saldoSalario: number;
  @Field(() => Float) ferias13: number;
  @Field(() => Float) feriasProp: number;
  @Field(() => Float) tercoFerias: number;
  @Field(() => Float) feriasVencidas: number;
  @Field(() => Float) aviso: number;
  @Field(() => Float) saldoFgts: number;
  @Field(() => Float) multa40Fgts: number;
  @Field(() => Float) totalBruto: number;
  @Field(() => Float) inssRescisao: number;
  @Field(() => Float) irrfRescisao: number;
  @Field(() => Float) totalLiquido: number;
  @Field(() => [String]) direitos: string[];
  @Field() status: string;
}

@Resolver()
export class FeriasRescisaoResolver {
  constructor(private readonly service: FeriasRescisaoService) {}

  @Query(() => [FeriasType])
  async listarFerias(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarFerias(companyId);
  }

  @Query(() => [RescisaoType])
  async listarRescisoes(@Args('companyId', { type: () => ID }) companyId: string) {
    return this.service.listarRescisoes(companyId);
  }

  @Query(() => [DecimoTerceiroItemType])
  async calcularDecimoTerceiro(
    @Args('companyId', { type: () => ID }) companyId: string,
    @Args('ano', { type: () => Int }) ano: number,
  ) {
    return this.service.calcularDecimo(companyId, ano);
  }

  @Mutation(() => FeriasType)
  async calcularFerias(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('periodoAquisitivo') periodoAquisitivo: string,
    @Args('dtInicioGozo') dtInicioGozo: string,
    @Args('dtFimGozo') dtFimGozo: string,
    @Args('diasGozo', { type: () => Int, nullable: true, defaultValue: 30 }) diasGozo: number,
    @Args('diasVendidos', { type: () => Int, nullable: true, defaultValue: 0 }) diasVendidos: number,
  ) {
    return this.service.calcularFerias(employeeId, periodoAquisitivo, dtInicioGozo, dtFimGozo, diasGozo, diasVendidos);
  }

  @Mutation(() => RescisaoType)
  async calcularRescisao(
    @Args('employeeId', { type: () => ID }) employeeId: string,
    @Args('dataDemissao') dataDemissao: string,
    @Args('tipoRescisao') tipoRescisao: string,
    @Args('avisoPrevioTrabalhado', { nullable: true, defaultValue: true }) avisoPrevioTrabalhado: boolean,
  ) {
    return this.service.calcularRescisao(employeeId, dataDemissao, tipoRescisao, avisoPrevioTrabalhado);
  }
}
