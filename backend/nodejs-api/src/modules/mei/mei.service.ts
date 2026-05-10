import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const DAS_INSS = 75.90;      // 2024 - 75% do salário mínimo
const DAS_ISS = 5.00;        // ISS fixo para serviços
const DAS_ICMS = 1.00;       // ICMS fixo para comércio
const LIMITE_ANUAL = 81000;  // Teto MEI 2024

@Injectable()
export class MeiService {
  constructor(private prisma: PrismaService) {}

  async calcularDAS(companyId: string, competencia: string, receitaComercio: number, receitaServicos: number) {
    const receitaTotal = receitaComercio + receitaServicos;

    // Verifica limite anual
    const ano = competencia.split('-')[0];
    const apuracoes = await this.prisma.meiApuracao.findMany({
      where: { companyId, competencia: { startsWith: ano }, tipo: 'mensal' },
    });
    const receitaAcumulada = apuracoes.reduce((s, a) => s + a.receitaTotal, 0) + receitaTotal;
    const percentualUsado = (receitaAcumulada / LIMITE_ANUAL) * 100;

    let dasIss = 0;
    let dasIcms = 0;
    if (receitaServicos > 0) dasIss = DAS_ISS;
    if (receitaComercio > 0) dasIcms = DAS_ICMS;

    const dasValor = DAS_INSS + dasIss + dasIcms;

    return this.prisma.meiApuracao.upsert({
      where: { id: `${companyId}-${competencia}`.replace(/-/g, '') },
      create: {
        id: `${companyId}-${competencia}`.replace(/-/g, ''),
        companyId, competencia, tipo: 'mensal',
        receitaComercio, receitaServicos, receitaTotal,
        limiteAnual: LIMITE_ANUAL, percentualUsado,
        dasValor, dasInss: DAS_INSS, dasIss, dasIcms,
      },
      update: {
        receitaComercio, receitaServicos, receitaTotal,
        percentualUsado, dasValor, dasInss: DAS_INSS, dasIss, dasIcms,
      },
    });
  }

  async listar(companyId: string) {
    return this.prisma.meiApuracao.findMany({
      where: { companyId },
      orderBy: { competencia: 'desc' },
    });
  }

  async registrarPagamento(id: string) {
    return this.prisma.meiApuracao.update({
      where: { id },
      data: { status: 'pago', dataPagamento: new Date() },
    });
  }

  async dasn(companyId: string, anoBase: string) {
    // Apuração anual DASN-SIMEI
    const apuracoes = await this.prisma.meiApuracao.findMany({
      where: { companyId, competencia: { startsWith: anoBase }, tipo: 'mensal' },
    });

    const receitaComercio = apuracoes.reduce((s, a) => s + a.receitaComercio, 0);
    const receitaServicos = apuracoes.reduce((s, a) => s + a.receitaServicos, 0);
    const receitaTotal = receitaComercio + receitaServicos;
    const dentro_limite = receitaTotal <= LIMITE_ANUAL;

    return this.prisma.meiApuracao.create({
      data: {
        companyId,
        competencia: anoBase,
        tipo: 'anual_dasn',
        receitaComercio, receitaServicos, receitaTotal,
        limiteAnual: LIMITE_ANUAL,
        percentualUsado: (receitaTotal / LIMITE_ANUAL) * 100,
        dasValor: 0,
      },
    });
  }

  async resumo(companyId: string) {
    const anoAtual = new Date().getFullYear().toString();
    const apuracoes = await this.prisma.meiApuracao.findMany({
      where: { companyId, competencia: { startsWith: anoAtual }, tipo: 'mensal' },
    });
    const receitaAnual = apuracoes.reduce((s, a) => s + a.receitaTotal, 0);
    const percentualUsado = (receitaAnual / LIMITE_ANUAL) * 100;
    const dasPago = apuracoes.filter(a => a.status === 'pago').reduce((s, a) => s + a.dasValor, 0);
    const dasPendente = apuracoes.filter(a => a.status !== 'pago').reduce((s, a) => s + a.dasValor, 0);

    return {
      receitaAnual, percentualUsado: percentualUsado.toFixed(1),
      limiteRestante: LIMITE_ANUAL - receitaAnual,
      dasPago, dasPendente,
      emRisco: percentualUsado >= 80,
    };
  }
}
