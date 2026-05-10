import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// Taxas de depreciação anuais por categoria (IN RFB 1700/2017)
const TAXAS_DEPRECIACAO: Record<string, number> = {
  IMOVEL:      0.04,
  MOVEL:       0.10,
  VEICULO:     0.20,
  COMPUTADOR:  0.20,
  MAQUINA:     0.10,
  EQUIPAMENTO: 0.10,
  FERRAMENTA:  0.25,
  INSTALACAO:  0.10,
  SOFTWARE:    0.333,
  INTANGIVEL:  0.20,
  OUTROS:      0.10,
};

@Injectable()
export class PatrimonioService {
  constructor(private prisma: PrismaService) {}

  async cadastrarAtivo(data: {
    companyId: string;
    descricao: string;
    categoria: string;
    dataAquisicao: string;
    valorAquisicao: number;
    vidaUtilAnos?: number;
    fornecedor?: string;
    notaFiscal?: string;
    localizacao?: string;
  }) {
    const taxaDepreciacao = TAXAS_DEPRECIACAO[data.categoria.toUpperCase()] || 0.10;
    const vidaUtilAnos = data.vidaUtilAnos || Math.round(1 / taxaDepreciacao);
    const valorResidual = data.valorAquisicao * 0.10;

    return this.prisma.ativoImobilizado.create({
      data: {
        companyId: data.companyId,
        descricao: data.descricao,
        categoria: data.categoria,
        dataAquisicao: new Date(data.dataAquisicao),
        valorAquisicao: data.valorAquisicao,
        valorResidual,
        taxaDepreciacao,
        vidaUtilAnos,
        fornecedor: data.fornecedor,
        notaFiscal: data.notaFiscal,
        localizacao: data.localizacao,
        ativo: true,
      },
    });
  }

  async listarAtivos(companyId: string) {
    return this.prisma.ativoImobilizado.findMany({
      where: { companyId },
      include: { depreciations: { orderBy: { competencia: 'desc' }, take: 1 } },
      orderBy: { descricao: 'asc' },
    });
  }

  async calcularDepreciacao(companyId: string, competencia: string) {
    const ativos = await this.prisma.ativoImobilizado.findMany({
      where: { companyId, ativo: true },
    });

    const [ano, mes] = competencia.split('-').map(Number);
    const dtCompetencia = new Date(ano, mes - 1, 1);
    const depreciados: any[] = [];

    for (const ativo of ativos) {
      const dtAquisicao = new Date(ativo.dataAquisicao);
      if (dtCompetencia < dtAquisicao) continue;

      const existing = await this.prisma.depreciation.findFirst({
        where: { ativoId: ativo.id, competencia },
      });
      if (existing) { depreciados.push(existing); continue; }

      const valorDepreciavelTotal = Number(ativo.valorAquisicao) - Number(ativo.valorResidual);
      const depreciacaoMensal = valorDepreciavelTotal * Number(ativo.taxaDepreciacao) / 12;

      const anteriores = await this.prisma.depreciation.aggregate({
        where: { ativoId: ativo.id },
        _sum: { valorDepreciacao: true },
      });
      const acumuladoAnterior = Number(anteriores._sum.valorDepreciacao || 0);
      const valorLiquidoAnterior = Number(ativo.valorAquisicao) - acumuladoAnterior;

      if (valorLiquidoAnterior <= Number(ativo.valorResidual)) continue;

      const depreciacaoEfetiva = Math.min(depreciacaoMensal, valorLiquidoAnterior - Number(ativo.valorResidual));
      const novoAcumulado = acumuladoAnterior + depreciacaoEfetiva;
      const novoLiquido = Number(ativo.valorAquisicao) - novoAcumulado;

      const dep = await this.prisma.depreciation.create({
        data: {
          ativoId: ativo.id,
          competencia,
          valorDepreciacao: Number(depreciacaoEfetiva.toFixed(2)),
          valorAcumulado: Number(novoAcumulado.toFixed(2)),
          valorLiquido: Number(novoLiquido.toFixed(2)),
        },
      });
      depreciados.push(dep);
    }

    return depreciados;
  }

  async baixarAtivo(ativoId: string, motivo: string, valorVenda?: number) {
    const ativo = await this.prisma.ativoImobilizado.findUnique({ where: { id: ativoId } });
    if (!ativo) throw new NotFoundException('Ativo não encontrado');

    const deps = await this.prisma.depreciation.aggregate({
      where: { ativoId },
      _sum: { valorDepreciacao: true },
    });
    const depAcumulada = Number(deps._sum.valorDepreciacao || 0);
    const valorContabil = Number(ativo.valorAquisicao) - depAcumulada;
    const ganhoOuPerda = valorVenda !== undefined ? valorVenda - valorContabil : -valorContabil;

    return this.prisma.ativoImobilizado.update({
      where: { id: ativoId },
      data: {
        ativo: false,
        dataDesativacao: new Date(),
        motivoDesativacao: motivo,
        valorVenda,
        ganhoOuPerda: Number(ganhoOuPerda.toFixed(2)),
      },
    });
  }

  async relatorioPatrimonio(companyId: string) {
    const ativos = await this.prisma.ativoImobilizado.findMany({ where: { companyId } });
    const porCategoria: Record<string, any> = {};
    let totalAquisicao = 0, totalDepreciado = 0, totalContabil = 0;

    for (const ativo of ativos) {
      const deps = await this.prisma.depreciation.aggregate({
        where: { ativoId: ativo.id },
        _sum: { valorDepreciacao: true },
      });
      const depAcum = Number(deps._sum.valorDepreciacao || 0);
      const valContabil = Number(ativo.valorAquisicao) - depAcum;
      totalAquisicao += Number(ativo.valorAquisicao);
      totalDepreciado += depAcum;
      totalContabil += valContabil;

      if (!porCategoria[ativo.categoria]) {
        porCategoria[ativo.categoria] = { qtd: 0, valorAquisicao: 0, depreciado: 0, contabil: 0 };
      }
      porCategoria[ativo.categoria].qtd++;
      porCategoria[ativo.categoria].valorAquisicao += Number(ativo.valorAquisicao);
      porCategoria[ativo.categoria].depreciado += depAcum;
      porCategoria[ativo.categoria].contabil += valContabil;
    }

    return {
      totalAtivos: ativos.length,
      totalAquisicao: Number(totalAquisicao.toFixed(2)),
      totalDepreciado: Number(totalDepreciado.toFixed(2)),
      totalContabil: Number(totalContabil.toFixed(2)),
      porCategoria: Object.entries(porCategoria).map(([cat, vals]: any) => ({ categoria: cat, ...vals })),
    };
  }
}
