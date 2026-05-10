import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';

export interface SituacaoFiscal {
  cnpj: string;
  razaoSocial: string;
  situacao: 'ATIVA' | 'SUSPENSA' | 'INAPTA' | 'BAIXADA' | 'DESCONHECIDA';
  ultimaConsulta: Date;
  alertas: string[];
  dataAbertura?: string;
  capitalSocial?: number;
  atividade?: string;
}

@Injectable()
export class RadarEcacService {
  private readonly logger = new Logger(RadarEcacService.name);

  constructor(private readonly prisma: PrismaService) {}

  async consultarCNPJ(cnpj: string): Promise<SituacaoFiscal> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    // Verificar cache (última 24h)
    const cache = await this.prisma.radarEcacConsulta.findFirst({
      where: {
        cnpj: cnpjLimpo,
        ultimaConsulta: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { ultimaConsulta: 'desc' },
    });

    if (cache) {
      return {
        cnpj: cache.cnpj,
        razaoSocial: cache.razaoSocial || '',
        situacao: (cache.situacao as any) || 'DESCONHECIDA',
        ultimaConsulta: cache.ultimaConsulta,
        alertas: cache.alertas ? JSON.parse(cache.alertas) : [],
        dataAbertura: cache.dataAbertura || undefined,
        capitalSocial: cache.capitalSocial || undefined,
        atividade: cache.atividade || undefined,
      };
    }

    // Consultar BrasilAPI
    try {
      const resultado = await this._consultarBrasilAPI(cnpjLimpo);
      await this._salvarCache(cnpjLimpo, resultado, 'brasilapi');
      return resultado;
    } catch (err) {
      this.logger.warn(`BrasilAPI falhou para ${cnpjLimpo}, tentando ReceitaWS...`);
      try {
        const resultado = await this.verificarSituacaoFiscal(cnpjLimpo);
        await this._salvarCache(cnpjLimpo, resultado, 'receitaws');
        return resultado;
      } catch (err2) {
        this.logger.error(`Ambas as fontes falharam para CNPJ ${cnpjLimpo}`);
        throw new Error(`Não foi possível consultar o CNPJ ${cnpj}. Tente novamente mais tarde.`);
      }
    }
  }

  private async _consultarBrasilAPI(cnpj: string): Promise<SituacaoFiscal> {
    const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
    const { data } = await axios.get(url, { timeout: 10000 });

    const alertas: string[] = [];
    const situacaoRaw: string = (data.descricao_situacao_cadastral || '').toUpperCase();
    let situacao: SituacaoFiscal['situacao'] = 'DESCONHECIDA';

    if (situacaoRaw.includes('ATIVA')) situacao = 'ATIVA';
    else if (situacaoRaw.includes('SUSPENSA')) situacao = 'SUSPENSA';
    else if (situacaoRaw.includes('INAPTA')) situacao = 'INAPTA';
    else if (situacaoRaw.includes('BAIXADA')) situacao = 'BAIXADA';

    if (situacao !== 'ATIVA') {
      alertas.push(`Situação cadastral: ${situacaoRaw}`);
    }

    // Alertar sobre natureza jurídica relevante
    if (data.natureza_juridica) {
      const nj = data.natureza_juridica.toLowerCase();
      if (nj.includes('eireli') || nj.includes('mei')) {
        alertas.push(`Natureza jurídica: ${data.natureza_juridica}`);
      }
    }

    return {
      cnpj,
      razaoSocial: data.razao_social || '',
      situacao,
      ultimaConsulta: new Date(),
      alertas,
      dataAbertura: data.data_inicio_atividade,
      capitalSocial: data.capital_social ? parseFloat(data.capital_social) : undefined,
      atividade: data.cnae_fiscal_descricao,
    };
  }

  async verificarSituacaoFiscal(cnpj: string): Promise<SituacaoFiscal> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const url = `https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`;
    const { data } = await axios.get(url, { timeout: 10000 });

    const alertas: string[] = [];
    const situacaoRaw: string = (data.situacao || '').toUpperCase();
    let situacao: SituacaoFiscal['situacao'] = 'DESCONHECIDA';

    if (situacaoRaw === 'ATIVA') situacao = 'ATIVA';
    else if (situacaoRaw === 'SUSPENSA') situacao = 'SUSPENSA';
    else if (situacaoRaw === 'INAPTA') situacao = 'INAPTA';
    else if (situacaoRaw === 'BAIXADA') situacao = 'BAIXADA';

    if (situacao !== 'ATIVA') {
      alertas.push(`Situação cadastral: ${situacaoRaw}`);
    }

    if (data.motivo_situacao) {
      alertas.push(`Motivo: ${data.motivo_situacao}`);
    }

    return {
      cnpj: cnpjLimpo,
      razaoSocial: data.nome || '',
      situacao,
      ultimaConsulta: new Date(),
      alertas,
      dataAbertura: data.abertura,
      capitalSocial: data.capital_social ? parseFloat(data.capital_social.replace(/\./g, '').replace(',', '.')) : undefined,
      atividade: data.atividade_principal?.[0]?.text,
    };
  }

  async consultarLoteCNPJs(companyId: string): Promise<SituacaoFiscal[]> {
    // Busca todas as empresas do tenant (escritório)
    const empresas = await this.prisma.company.findMany({
      where: { active: true },
      select: { cnpj: true, name: true },
    });

    const resultados: SituacaoFiscal[] = [];

    for (const empresa of empresas) {
      if (!empresa.cnpj) continue;
      try {
        const resultado = await this.consultarCNPJ(empresa.cnpj);
        resultados.push(resultado);
      } catch (err) {
        this.logger.warn(`Erro ao consultar ${empresa.cnpj}: ${err.message}`);
        resultados.push({
          cnpj: empresa.cnpj,
          razaoSocial: empresa.name,
          situacao: 'DESCONHECIDA',
          ultimaConsulta: new Date(),
          alertas: ['Erro ao consultar: ' + err.message],
        });
      }
      // Delay para não bater rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return resultados;
  }

  async getHistorico(companyId: string, cnpj?: string) {
    return this.prisma.radarEcacConsulta.findMany({
      where: cnpj ? { cnpj: cnpj.replace(/\D/g, '') } : undefined,
      orderBy: { ultimaConsulta: 'desc' },
      take: 100,
    });
  }

  private async _salvarCache(cnpj: string, resultado: SituacaoFiscal, fonte: string) {
    await this.prisma.radarEcacConsulta.create({
      data: {
        cnpj,
        razaoSocial: resultado.razaoSocial,
        situacao: resultado.situacao,
        dataAbertura: resultado.dataAbertura,
        capitalSocial: resultado.capitalSocial,
        atividade: resultado.atividade,
        alertas: JSON.stringify(resultado.alertas),
        fonte,
        ultimaConsulta: resultado.ultimaConsulta,
      },
    });
  }
}
