import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// Tabela INSS 2024
const TABELA_INSS_2024 = [
  { ate: 1412.00,   aliq: 0.075 },
  { ate: 2666.68,   aliq: 0.09  },
  { ate: 4000.03,   aliq: 0.12  },
  { ate: 7786.02,   aliq: 0.14  },
];

// Tabela IRRF 2024 (mensal)
const TABELA_IRRF_2024 = [
  { ate: 2259.20,  aliq: 0,     deducao: 0       },
  { ate: 2826.65,  aliq: 0.075, deducao: 169.44  },
  { ate: 3751.05,  aliq: 0.15,  deducao: 381.44  },
  { ate: 4664.68,  aliq: 0.225, deducao: 662.77  },
  { ate: Infinity, aliq: 0.275, deducao: 896.00  },
];

const DEDUCAO_DEPENDENTE = 189.59;

function calcINSS(salario: number): number {
  let inss = 0;
  let restante = salario;
  let limiteAnterior = 0;
  for (const faixa of TABELA_INSS_2024) {
    if (restante <= 0) break;
    const base = Math.min(restante, faixa.ate - limiteAnterior);
    inss += base * faixa.aliq;
    restante -= base;
    limiteAnterior = faixa.ate;
  }
  return Number(inss.toFixed(2));
}

function calcIRRF(baseCalculo: number, dependentes: number = 0): number {
  const baseDepend = baseCalculo - (dependentes * DEDUCAO_DEPENDENTE);
  const faixa = TABELA_IRRF_2024.find(f => baseDepend <= f.ate);
  if (!faixa || faixa.aliq === 0) return 0;
  return Number(Math.max(0, (baseDepend * faixa.aliq) - faixa.deducao).toFixed(2));
}

@Injectable()
export class FeriasRescisaoService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // FÉRIAS
  // ─────────────────────────────────────────────

  async calcularFerias(
    employeeId: string,
    periodoAquisitivo: string,
    dtInicioGozo: string,
    dtFimGozo: string,
    diasGozo: number = 30,
    diasVendidos: number = 0,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    const salario = Number(employee.baseSalary);
    const diasEfetivos = diasGozo;
    const diasVendidosEfetivo = Math.min(diasVendidos, 10);

    const salarioBase = (salario / 30) * diasEfetivos;
    const tercoConstitucional = salarioBase / 3;
    const valorVendido = diasVendidosEfetivo > 0
      ? ((salario / 30) * diasVendidosEfetivo) * (1 + 1/3)
      : 0;

    const baseINSS = salarioBase + tercoConstitucional;
    const inss = calcINSS(baseINSS);
    const baseIRRF = baseINSS - inss;
    const irrf = calcIRRF(baseIRRF, Number(employee.dependents || 0));

    const valorTotal = salarioBase + tercoConstitucional + valorVendido;
    const valorLiquido = valorTotal - inss - irrf;

    return this.prisma.ferias.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        periodoAquisitivo,
        dtInicioGozo: new Date(dtInicioGozo),
        dtFimGozo: new Date(dtFimGozo),
        diasFeriasDireito: 30,
        diasVendidos: diasVendidosEfetivo,
        diasUsufruidos: diasEfetivos,
        salarioBase: Number(salarioBase.toFixed(2)),
        tercoConstitucional: Number(tercoConstitucional.toFixed(2)),
        valorVendido: Number(valorVendido.toFixed(2)),
        valorTotal: Number(valorTotal.toFixed(2)),
        inssFerias: Number(inss.toFixed(2)),
        irrfFerias: Number(irrf.toFixed(2)),
        valorLiquido: Number(valorLiquido.toFixed(2)),
        status: 'programada',
      },
    });
  }

  async listarFerias(companyId: string) {
    return this.prisma.ferias.findMany({
      where: { companyId },
      include: { employee: { select: { name: true, role: true } } },
      orderBy: { dtInicioGozo: 'desc' },
    });
  }

  async calcularDecimo(companyId: string, ano: number) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, active: true },
    });

    const results: any[] = [];

    for (const emp of employees) {
      const dtAdmissao = new Date(emp.admissionDate);
      const mesAdmissao = dtAdmissao.getFullYear() < ano ? 0 : dtAdmissao.getMonth();
      const avosAquisitivos = 12 - mesAdmissao;
      const salario = Number(emp.baseSalary);

      const primeiraParcela = (salario * avosAquisitivos / 12) * 0.5;
      const baseTotalDecimo = salario * avosAquisitivos / 12;
      const inss = calcINSS(baseTotalDecimo);
      const baseIRRF = baseTotalDecimo - inss;
      const irrf = calcIRRF(baseIRRF, Number(emp.dependents || 0));
      const segundaParcela = baseTotalDecimo * 0.5 - inss - irrf;

      results.push({
        employeeId: emp.id,
        employeeNome: emp.name,
        salario,
        avosAquisitivos,
        totalBruto: Number(baseTotalDecimo.toFixed(2)),
        primeiraParcela: Number(primeiraParcela.toFixed(2)),
        inss: Number(inss.toFixed(2)),
        irrf: Number(irrf.toFixed(2)),
        segundaParcela: Number(segundaParcela.toFixed(2)),
        totalLiquido: Number((primeiraParcela + segundaParcela).toFixed(2)),
      });
    }

    return results;
  }

  // ─────────────────────────────────────────────
  // RESCISÃO
  // ─────────────────────────────────────────────

  async calcularRescisao(
    employeeId: string,
    dataDemissao: string,
    tipoRescisao: string,
    avisoPrevioTrabalhado: boolean = true,
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Funcionário não encontrado');

    const dtDemissao = new Date(dataDemissao);
    const dtAdmissao = new Date(employee.admissionDate);
    const salario = Number(employee.baseSalary);

    const mesesTrabalhados = this.mesesEntre(dtAdmissao, dtDemissao);
    const anosCompletos = Math.floor(mesesTrabalhados / 12);
    const mesesFracao = mesesTrabalhados % 12;

    // Aviso prévio: 30 + 3 dias por ano trabalhado, máx 90
    const diasAvisoPrevio = Math.min(30 + (anosCompletos * 3), 90);
    const valorAviso = !avisoPrevioTrabalhado ? (salario / 30) * diasAvisoPrevio : 0;

    // Saldo de salário (dias do mês)
    const saldoSalario = (salario / 30) * dtDemissao.getDate();

    // 13º proporcional
    const ferias13 = (salario / 12) * (mesesFracao + 1);

    // Férias proporcionais + 1/3
    const feriasProp = (salario / 12) * (mesesFracao + 1);
    const tercoFerias = feriasProp / 3;

    // Férias vencidas (período anterior não gozado)
    const feriasVencidas = anosCompletos > 0 ? salario + salario / 3 : 0;

    // Multa FGTS
    const saldoFgts = salario * mesesTrabalhados * 0.08;
    let multa40Fgts = 0;
    if (['sem_justa_causa', 'rescisao_indireta'].includes(tipoRescisao.toLowerCase())) {
      multa40Fgts = saldoFgts * 0.40;
    } else if (tipoRescisao.toLowerCase() === 'culpa_reciproca') {
      multa40Fgts = saldoFgts * 0.20;
    }

    const totalBruto = saldoSalario + ferias13 + feriasProp + tercoFerias + feriasVencidas + valorAviso;

    const inssRescisao = calcINSS(saldoSalario + ferias13);
    const baseIRRF = totalBruto - inssRescisao;
    const irrfRescisao = ['com_justa_causa', 'pedido_demissao'].includes(tipoRescisao.toLowerCase())
      ? 0
      : calcIRRF(baseIRRF, Number(employee.dependents || 0));

    const totalLiquido = totalBruto + multa40Fgts - inssRescisao - irrfRescisao;

    const direitos = this.getDireitos(tipoRescisao);

    return this.prisma.rescisao.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        dataDemissao: dtDemissao,
        tipoRescisao: tipoRescisao.toLowerCase(),
        avisoPrevio: avisoPrevioTrabalhado ? 'trabalhado' : 'indenizado',
        diasAvisoPrevio,
        ultimoSalario: salario,
        mediaSalario: salario,
        saldoSalario: Number(saldoSalario.toFixed(2)),
        aviso: Number(valorAviso.toFixed(2)),
        ferias13: Number(ferias13.toFixed(2)),
        feriasProp: Number(feriasProp.toFixed(2)),
        feriasVencidas: Number(feriasVencidas.toFixed(2)),
        tercoFerias: Number(tercoFerias.toFixed(2)),
        multa40Fgts: Number(multa40Fgts.toFixed(2)),
        totalBruto: Number(totalBruto.toFixed(2)),
        inssRescisao: Number(inssRescisao.toFixed(2)),
        irrfRescisao: Number(irrfRescisao.toFixed(2)),
        totalLiquido: Number(totalLiquido.toFixed(2)),
        saldoFgts: Number(saldoFgts.toFixed(2)),
        breakdown: JSON.stringify({
          mesesTrabalhados,
          direitos,
          saldoSalario,
          ferias13,
          feriasProp,
          tercoFerias,
          feriasVencidas,
          valorAviso,
          multa40Fgts,
          inssRescisao,
          irrfRescisao,
        }),
        status: 'calculada',
      },
    });
  }

  async listarRescisoes(companyId: string) {
    const rescisoes = await this.prisma.rescisao.findMany({
      where: { companyId },
      include: { employee: { select: { name: true, role: true } } },
      orderBy: { dataDemissao: 'desc' },
    });

    return rescisoes.map(r => ({
      ...r,
      direitos: JSON.parse(r.breakdown || '{}').direitos || [],
      mesesTrabalhados: JSON.parse(r.breakdown || '{}').mesesTrabalhados || 0,
      avisoPrevioTrabalhado: r.avisoPrevio === 'trabalhado',
      decimoTerceiroProporcional: r.ferias13,
      feriasProporcional: r.feriasProp,
      valorAvisoPrevio: r.aviso,
      fgtsDeposito: r.saldoFgts * 0.08,
      multaFGTS: r.multa40Fgts,
      inss: r.inssRescisao,
      irrf: r.irrfRescisao,
    }));
  }

  private mesesEntre(inicio: Date, fim: Date): number {
    return (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
  }

  private getDireitos(tipoRescisao: string): string[] {
    const base = ['Saldo de salário', 'Férias proporcionais + 1/3'];
    const mapa: Record<string, string[]> = {
      sem_justa_causa: [
        ...base, '13º salário proporcional', 'Aviso prévio indenizado',
        'Multa de 40% do FGTS', 'Seguro-desemprego', 'Levantamento do FGTS',
      ],
      com_justa_causa: ['Saldo de salário'],
      pedido_demissao: [...base, '13º salário proporcional'],
      rescisao_indireta: [
        ...base, '13º salário proporcional', 'Aviso prévio',
        'Multa de 40% do FGTS', 'Seguro-desemprego', 'Levantamento do FGTS',
      ],
      acordo: [
        ...base, '13º salário proporcional',
        'Aviso prévio (50% indenizado)', 'Multa de 20% do FGTS', '80% do saldo FGTS',
      ],
      culpa_reciproca: [
        ...base, '13º salário proporcional (50%)',
        'Aviso prévio (50%)', 'Multa de 20% do FGTS',
      ],
    };
    return mapa[tipoRescisao.toLowerCase()] || base;
  }
}
