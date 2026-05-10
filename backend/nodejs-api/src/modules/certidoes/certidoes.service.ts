import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CertidoesService {
  constructor(private prisma: PrismaService) {}

  async solicitarCertidao(companyId: string, tipo: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const cnpjConsultado = (company.cnpj || '').replace(/\D/g, '');

    const resultado = await this.consultarOrgao(tipo, cnpjConsultado);
    const dataValidade = this.calcularValidade(tipo);

    return this.prisma.certidao.create({
      data: {
        companyId,
        tipo,
        orgao: resultado.orgao,
        status: resultado.status,
        cnpjConsultado,
        dataEmissao: new Date(),
        dataValidade,
        codigoControle: resultado.codigoControle,
        rawResponse: resultado.rawResponse,
        pdfUrl: resultado.pdfUrl,
      },
    });
  }

  async listarCertidoes(companyId: string) {
    return this.prisma.certidao.findMany({
      where: { companyId },
      orderBy: { dataEmissao: 'desc' },
    });
  }

  async verificarVencimentos(companyId: string) {
    const hoje = new Date();
    const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [vencendo, vencidas] = await Promise.all([
      this.prisma.certidao.findMany({
        where: { companyId, dataValidade: { lte: em30dias, gte: hoje }, status: 'negativa' },
        orderBy: { dataValidade: 'asc' },
      }),
      this.prisma.certidao.findMany({
        where: { companyId, dataValidade: { lt: hoje } },
      }),
    ]);

    return { vencendo, vencidas };
  }

  private calcularValidade(tipo: string): Date {
    const dias: Record<string, number> = {
      federal: 180, estadual: 180, municipal: 180,
      fgts: 30, trabalhista: 180, simples: 60, protestos: 30,
    };
    const d = dias[tipo.toLowerCase()] || 180;
    return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
  }

  private async consultarOrgao(tipo: string, cnpj: string) {
    // Em produção: integrar APIs reais (Receita Federal, CAIXA, TST, etc.)
    const orgaos: Record<string, string> = {
      federal: 'Receita Federal do Brasil',
      estadual: 'Secretaria de Estado da Fazenda',
      municipal: 'Secretaria Municipal de Finanças',
      fgts: 'Caixa Econômica Federal',
      trabalhista: 'Tribunal Superior do Trabalho',
      simples: 'Receita Federal - Simples Nacional',
      protestos: 'Cartório de Protesto',
    };

    return {
      status: 'negativa',
      orgao: orgaos[tipo.toLowerCase()] || tipo,
      codigoControle: `${tipo.substring(0, 3).toUpperCase()}-${Date.now()}-${cnpj.substring(0, 8)}`,
      rawResponse: JSON.stringify({ tipo, cnpj, resultado: 'Certidão Negativa de Débitos' }),
      pdfUrl: null as string | null,
    };
  }
}
