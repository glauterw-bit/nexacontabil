import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PlanejamentoTributarioService {
  constructor(private prisma: PrismaService) {}

  async analisarRegimes(companyId: string, anoBase: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const dtIni = new Date(anoBase, 0, 1);
    const dtFim = new Date(anoBase + 1, 0, 1);

    const [transacoes, payslips] = await Promise.all([
      this.prisma.transaction.findMany({ where: { companyId, date: { gte: dtIni, lt: dtFim } } }),
      this.prisma.payslip.findMany({
        where: { companyId, referenceMonth: { gte: `${anoBase}-01`, lt: `${anoBase + 1}-01` } },
      }),
    ]);

    const receitaBruta = transacoes.reduce((s, t) => s + Number(t.totalCredit), 0);
    const totalDespesas = transacoes.reduce((s, t) => s + Number(t.totalDebit), 0);
    const lucroLiquido = receitaBruta - totalDespesas;
    const folhaPagamento = payslips.reduce((s, p) => s + Number(p.grossSalary || 0), 0);
    const margemLucro = receitaBruta > 0 ? lucroLiquido / receitaBruta : 0.15;

    const simples = this.calcSimples(receitaBruta, folhaPagamento, company.taxRegime);
    const lp = this.calcLucroPresumido(receitaBruta, folhaPagamento);
    const lr = this.calcLucroReal(receitaBruta, totalDespesas, lucroLiquido, folhaPagamento);

    const impostoSimples = simples.totalImpostos;
    const impostoPresumido = lp.totalImpostos;
    const impostoReal = lr.totalImpostos;

    const melhorRegime = impostoSimples <= impostoPresumido && impostoSimples <= impostoReal
      ? 'Simples Nacional'
      : impostoPresumido <= impostoReal ? 'Lucro Presumido' : 'Lucro Real';

    const economiaAnual = Math.max(impostoSimples, impostoPresumido, impostoReal)
      - Math.min(impostoSimples, impostoPresumido, impostoReal);

    const detalhamento = JSON.stringify({ simples, lp, lr, margemLucro });

    const simulacao = await this.prisma.taxSimulation.create({
      data: {
        companyId,
        anoBase,
        receitaBruta,
        folhaPagamento,
        impostoSimples,
        aliquotaSimples: receitaBruta > 0 ? Number(((impostoSimples / receitaBruta) * 100).toFixed(2)) : 0,
        impostoPresumido,
        aliquotaPresumida: receitaBruta > 0 ? Number(((impostoPresumido / receitaBruta) * 100).toFixed(2)) : 0,
        impostoReal,
        aliquotaReal: receitaBruta > 0 ? Number(((impostoReal / receitaBruta) * 100).toFixed(2)) : 0,
        melhorRegime,
        economiaMensal: Number((economiaAnual / 12).toFixed(2)),
        economiaAnual: Number(economiaAnual.toFixed(2)),
        detalhamento,
        recomendacaoIA: this.gerarRecomendacao(melhorRegime, economiaAnual, margemLucro, receitaBruta),
      },
    });

    return {
      ...simulacao,
      simples,
      lp,
      lr,
      melhorRegime,
      economiaAnual: Number(economiaAnual.toFixed(2)),
    };
  }

  async listarSimulacoes(companyId: string) {
    return this.prisma.taxSimulation.findMany({
      where: { companyId },
      orderBy: { anoBase: 'desc' },
    });
  }

  async gerarRelatorio(simulacaoId: string) {
    const sim = await this.prisma.taxSimulation.findUnique({ where: { id: simulacaoId } });
    if (!sim) throw new NotFoundException('Simulação não encontrada');
    const detalhes = JSON.parse(sim.detalhamento || '{}');
    return { simulacao: sim, ...detalhes };
  }

  private calcSimples(receita: number, folha: number, _taxRegime: string) {
    const tabela = [
      { ate: 180000,  aliq: 0.06,  ded: 0 },
      { ate: 360000,  aliq: 0.112, ded: 9360 },
      { ate: 720000,  aliq: 0.135, ded: 17640 },
      { ate: 1800000, aliq: 0.16,  ded: 35640 },
      { ate: 3600000, aliq: 0.21,  ded: 125640 },
      { ate: 4800000, aliq: 0.33,  ded: 648000 },
    ];

    if (receita > 4800000) {
      return { regime: 'Simples Nacional', totalImpostos: 0, obs: 'Fora do limite (R$ 4,8M)', receita };
    }
    const faixa = tabela.find(f => receita <= f.ate) || tabela[tabela.length - 1];
    const aliqEfetiva = receita > 0 ? ((receita * faixa.aliq) - faixa.ded) / receita : faixa.aliq;
    const totalImpostos = receita * aliqEfetiva;
    const fatorR = receita > 0 ? folha / receita : 0;

    return {
      regime: 'Simples Nacional',
      receita,
      aliquotaEfetiva: Number((aliqEfetiva * 100).toFixed(2)),
      totalImpostos: Number(totalImpostos.toFixed(2)),
      fatorR: Number((fatorR * 100).toFixed(2)),
      vantagens: ['Recolhimento unificado (DAS)', 'Menos obrigações acessórias', 'Menor custo contábil'],
      desvantagens: ['Limite R$ 4,8M', 'Sem aproveitamento de créditos PIS/COFINS'],
    };
  }

  private calcLucroPresumido(receita: number, folha: number) {
    const presuncao = 0.32; // serviços (pior caso)
    const baseIRPJ = receita * presuncao;
    const irpj = baseIRPJ * 0.15 + Math.max(0, (baseIRPJ / 12 - 20000)) * 0.10;
    const csll = receita * 0.32 * 0.09;
    const pis = receita * 0.0065;
    const cofins = receita * 0.03;
    const inss = folha * 0.2775;
    const totalImpostos = irpj + csll + pis + cofins + inss;

    return {
      regime: 'Lucro Presumido',
      receita,
      irpj: Number(irpj.toFixed(2)),
      csll: Number(csll.toFixed(2)),
      pis: Number(pis.toFixed(2)),
      cofins: Number(cofins.toFixed(2)),
      inss: Number(inss.toFixed(2)),
      totalImpostos: Number(totalImpostos.toFixed(2)),
      aliquotaEfetiva: receita > 0 ? Number(((totalImpostos / receita) * 100).toFixed(2)) : 0,
      vantagens: ['Sem limite de faturamento', 'PIS/COFINS cumulativo (menor)'],
      desvantagens: ['INSS patronal separado (~28%)', 'Tributado mesmo com prejuízo'],
    };
  }

  private calcLucroReal(receita: number, despesa: number, lucro: number, folha: number) {
    const lucroAj = Math.max(0, lucro);
    const irpj = lucroAj * 0.15 + Math.max(0, lucroAj / 12 - 20000) * 0.10;
    const csll = lucroAj * 0.09;
    const pisLiq = Math.max(0, receita * 0.0165 - despesa * 0.0165);
    const cofinsLiq = Math.max(0, receita * 0.076 - despesa * 0.076);
    const inss = folha * 0.2775;
    const totalImpostos = irpj + csll + pisLiq + cofinsLiq + inss;

    return {
      regime: 'Lucro Real',
      receita,
      lucro: Number(lucroAj.toFixed(2)),
      irpj: Number(irpj.toFixed(2)),
      csll: Number(csll.toFixed(2)),
      pis: Number(pisLiq.toFixed(2)),
      cofins: Number(cofinsLiq.toFixed(2)),
      inss: Number(inss.toFixed(2)),
      totalImpostos: Number(totalImpostos.toFixed(2)),
      aliquotaEfetiva: receita > 0 ? Number(((totalImpostos / receita) * 100).toFixed(2)) : 0,
      vantagens: ['Tributado sobre lucro real', 'Créditos PIS/COFINS não-cumulativo', 'Compensa prejuízo fiscal'],
      desvantagens: ['Maior custo de compliance (SPED)', 'Contabilidade rigorosa obrigatória'],
    };
  }

  private gerarRecomendacao(melhor: string, economia: number, margem: number, receita: number): string {
    const eco = economia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `Regime recomendado: ${melhor}. Economia estimada de ${eco}/ano. `
      + `Margem de lucro: ${(margem * 100).toFixed(1)}%. `
      + (receita > 4800000 ? 'Simples Nacional não disponível (acima de R$ 4,8M). ' : '')
      + 'Consulte seu contador para validar esta análise com os dados reais do exercício.';
  }
}
