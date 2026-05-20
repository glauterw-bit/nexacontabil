import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { BalanceSheetService } from '../balance-sheet/balance-sheet.service';

/**
 * Médias setoriais BR — fontes:
 * - SEBRAE Pesquisa Setorial 2024
 * - SEFAZ Empresariômetro
 * - Receita Federal indicadores agregados Lucro Presumido/Real
 *
 * Unidades: percentuais em %, ratios em x, receita/funcionário em R$ mil/ano.
 */
const SETOR_AVG: Record<string, { margemLiquida: number; margemEbitda: number; roe: number; liquidez: number; endividamento: number; receitaFuncionario: number }> = {
  'Contabilidade e Consultoria':   { margemLiquida: 13.2, margemEbitda: 19.5, roe: 18.7, liquidez: 1.60, endividamento: 44.2, receitaFuncionario:  62.3 },
  'Comércio Varejista':            { margemLiquida:  4.8, margemEbitda:  9.1, roe: 12.4, liquidez: 1.35, endividamento: 52.8, receitaFuncionario: 142.0 },
  'Indústria de Transformação':    { margemLiquida:  7.6, margemEbitda: 14.2, roe: 13.9, liquidez: 1.48, endividamento: 49.5, receitaFuncionario: 215.7 },
  'Tecnologia da Informação':      { margemLiquida: 17.4, margemEbitda: 24.8, roe: 22.1, liquidez: 2.10, endividamento: 32.5, receitaFuncionario: 198.4 },
  'Saúde e Medicina':              { margemLiquida: 11.8, margemEbitda: 17.6, roe: 16.5, liquidez: 1.72, endividamento: 41.3, receitaFuncionario:  88.6 },
  'Construção Civil':              { margemLiquida:  5.4, margemEbitda: 11.7, roe: 10.9, liquidez: 1.25, endividamento: 58.4, receitaFuncionario: 178.2 },
  'Serviços Financeiros':          { margemLiquida: 21.6, margemEbitda: 31.2, roe: 17.8, liquidez: 1.85, endividamento: 38.4, receitaFuncionario: 254.9 },
};

const DEFAULT_SETOR = 'Contabilidade e Consultoria';

@Injectable()
export class BenchmarkService {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
    private balance: BalanceSheetService,
  ) {}

  listSetores() {
    return Object.keys(SETOR_AVG).map(name => ({ name, ...SETOR_AVG[name] }));
  }

  async compute(companyId: string, setorOverride?: string) {
    if (!companyId) throw new NotFoundException('companyId obrigatório');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const setor = setorOverride && SETOR_AVG[setorOverride] ? setorOverride : DEFAULT_SETOR;
    const setorAvg = SETOR_AVG[setor];

    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 12);

    const [dre, balanceMetrics] = await Promise.all([
      this.reports.getDRE(companyId, from, to),
      this.balance.getMetrics(companyId, to).catch(() => null),
    ]);

    const receita = Number(dre.grossRevenue || 0);
    const netIncome = Number(dre.netIncome || 0);
    const ebit = Number(dre.ebit || 0);
    // Sem detalhamento de depreciação, estimamos 3% da receita (média BR)
    const depEstimada = receita * 0.03;
    const ebitda = ebit + depEstimada;

    const empregadosAtivos = await this.prisma.employee.count({
      where: { companyId, active: true },
    });

    const margemLiquida = receita > 0 ? (netIncome / receita) * 100 : 0;
    const margemEbitda = receita > 0 ? (ebitda / receita) * 100 : 0;
    const receitaFuncionario = empregadosAtivos > 0 ? receita / empregadosAtivos / 1000 : 0;

    const patrimonioLiq = Number(balanceMetrics?.patrimonioLiquido || 0);
    const roe = patrimonioLiq > 0 ? round((netIncome / patrimonioLiq) * 100) : null;
    const liquidez = balanceMetrics?.liquidezCorrente ?? null;
    const endividamento = balanceMetrics?.endividamento ?? null;

    const empresa = {
      margemLiquida: round(margemLiquida),
      margemEbitda: round(margemEbitda),
      roe,
      liquidez,
      endividamento,
      receitaFuncionario: round(receitaFuncionario),
    };

    const metricas = [
      { dimensao: 'Margem Líquida', empresa: empresa.margemLiquida, setor: setorAvg.margemLiquida, unidade: '%', descricao: 'Lucro líquido / Receita líquida', menorMelhor: false },
      { dimensao: 'Margem EBITDA', empresa: empresa.margemEbitda, setor: setorAvg.margemEbitda, unidade: '%', descricao: 'EBITDA / Receita líquida (depr. estimada 3%)', menorMelhor: false },
      { dimensao: 'ROE', empresa: empresa.roe, setor: setorAvg.roe, unidade: '%', descricao: 'Lucro líquido / Patrimônio líquido', menorMelhor: false },
      { dimensao: 'Liquidez Corrente', empresa: empresa.liquidez, setor: setorAvg.liquidez, unidade: 'x', descricao: 'Ativo circulante / Passivo circulante', menorMelhor: false },
      { dimensao: 'Endividamento', empresa: empresa.endividamento, setor: setorAvg.endividamento, unidade: '%', descricao: 'Passivo total / Ativo total', menorMelhor: true },
      { dimensao: 'Receita/Funcionário', empresa: empresa.receitaFuncionario, setor: setorAvg.receitaFuncionario, unidade: 'k/ano', descricao: 'Receita anual por colaborador ativo (R$ mil)', menorMelhor: false },
    ];

    const computaveis = metricas.filter(m => m.empresa !== null);
    const acima = computaveis.filter(m => m.menorMelhor ? (m.empresa! < m.setor) : (m.empresa! > m.setor)).length;

    return {
      companyId,
      companyName: company.name,
      setor,
      computedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      empresa,
      acimaDaMedia: acima,
      totalMetricasComputaveis: computaveis.length,
      metricas,
      observacao: balanceMetrics?.balanceado
        ? 'Métricas baseadas em DRE dos últimos 12 meses + Balanço Patrimonial + headcount ativo.'
        : 'Métricas DRE + headcount disponíveis. Indicadores patrimoniais (ROE, Liquidez, Endividamento) requerem Balanço Patrimonial balanceado — verifique se há lançamentos contábeis aprovados.',
    };
  }
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
