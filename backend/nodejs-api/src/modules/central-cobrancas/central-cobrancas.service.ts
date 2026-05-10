import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CriarRegraDto {
  nome: string;
  diasAntes: number[];
  diasDepois: number[];
  mensagemTemplate: string;
  canal: 'email' | 'whatsapp' | 'ambos';
}

export interface EstatisticasCobranca {
  boletos: {
    total: number;
    pendentes: number;
    vencidos: number;
    pagos: number;
    cancelados: number;
    valorTotal: number;
    valorVencido: number;
    taxaInadimplencia: number;
  };
  lembretes: {
    total: number;
    enviados: number;
    falhos: number;
  };
}

@Injectable()
export class CentralCobrancasService {
  private readonly logger = new Logger(CentralCobrancasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async criarRegra(companyId: string, dto: CriarRegraDto) {
    return this.prisma.cobrancaRegra.create({
      data: {
        companyId,
        nome: dto.nome,
        diasAntes: JSON.stringify(dto.diasAntes),
        diasDepois: JSON.stringify(dto.diasDepois),
        mensagemTemplate: dto.mensagemTemplate,
        canal: dto.canal,
        ativo: true,
      },
    });
  }

  async listarRegras(companyId: string) {
    const regras = await this.prisma.cobrancaRegra.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return regras.map(r => ({
      ...r,
      diasAntes: JSON.parse(r.diasAntes),
      diasDepois: JSON.parse(r.diasDepois),
    }));
  }

  async processarLembretes(companyId: string): Promise<{ processados: number; detalhes: any[] }> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const regras = await this.prisma.cobrancaRegra.findMany({
      where: { companyId, ativo: true },
    });

    if (regras.length === 0) {
      return { processados: 0, detalhes: [] };
    }

    // Buscar boletos pendentes do tenant
    const boletos = await this.prisma.boleto.findMany({
      where: {
        companyId,
        status: 'pending',
      },
    });

    let processados = 0;
    const detalhes: any[] = [];

    for (const regra of regras) {
      const diasAntes: number[] = JSON.parse(regra.diasAntes);
      const diasDepois: number[] = JSON.parse(regra.diasDepois);

      for (const boleto of boletos) {
        const vencimento = new Date(boleto.dueDate);
        vencimento.setHours(0, 0, 0, 0);

        const diffDias = Math.floor(
          (vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
        );

        let tipo: 'antes' | 'depois' | null = null;
        let diasReferencia = 0;

        if (diffDias > 0 && diasAntes.includes(diffDias)) {
          tipo = 'antes';
          diasReferencia = diffDias;
        } else if (diffDias < 0 && diasDepois.includes(Math.abs(diffDias))) {
          tipo = 'depois';
          diasReferencia = Math.abs(diffDias);
        }

        if (!tipo) continue;

        // Verificar se já enviou lembrete hoje para este boleto/regra
        const jaEnviado = await this.prisma.cobrancaLembrete.findFirst({
          where: {
            regraId: regra.id,
            boletoId: boleto.id,
            tipo,
            diasReferencia,
          },
        });

        if (jaEnviado) continue;

        // Montar mensagem
        const mensagem = regra.mensagemTemplate
          .replace('{cliente}', boleto.payerName)
          .replace('{valor}', `R$ ${boleto.amount.toFixed(2)}`)
          .replace('{vencimento}', vencimento.toLocaleDateString('pt-BR'))
          .replace('{codigo_barras}', boleto.digitableLine || boleto.barcode || '');

        // Simular envio (log — integração real com Evolution/Resend quando configurado)
        this.logger.log(
          `[COBRANÇA] ${regra.canal.toUpperCase()} para ${boleto.payerName} (${tipo} ${diasReferencia}d): ${mensagem.substring(0, 80)}...`,
        );

        // Registrar lembrete
        await this.prisma.cobrancaLembrete.create({
          data: {
            regraId: regra.id,
            boletoId: boleto.id,
            companyId,
            tipo,
            diasReferencia,
            canal: regra.canal,
            status: 'simulado',
            mensagem,
          },
        });

        processados++;
        detalhes.push({
          boletoId: boleto.id,
          pagador: boleto.payerName,
          valor: boleto.amount,
          vencimento: boleto.dueDate,
          tipo,
          diasReferencia,
          canal: regra.canal,
        });
      }
    }

    return { processados, detalhes };
  }

  async getEstatisticas(companyId: string): Promise<EstatisticasCobranca> {
    const hoje = new Date();

    const boletos = await this.prisma.boleto.findMany({
      where: { companyId },
    });

    const total = boletos.length;
    const pendentes = boletos.filter(b => b.status === 'pending').length;
    const vencidos = boletos.filter(
      b => b.status === 'pending' && new Date(b.dueDate) < hoje,
    ).length;
    const pagos = boletos.filter(b => b.status === 'paid').length;
    const cancelados = boletos.filter(b => b.status === 'cancelled').length;

    const valorTotal = boletos
      .filter(b => b.status === 'pending')
      .reduce((s, b) => s + b.amount, 0);

    const valorVencido = boletos
      .filter(b => b.status === 'pending' && new Date(b.dueDate) < hoje)
      .reduce((s, b) => s + b.amount, 0);

    const taxaInadimplencia =
      total > 0 ? parseFloat(((vencidos / total) * 100).toFixed(2)) : 0;

    const todosLembretes = await this.prisma.cobrancaLembrete.findMany({
      where: { companyId },
    });

    return {
      boletos: {
        total,
        pendentes,
        vencidos,
        pagos,
        cancelados,
        valorTotal: parseFloat(valorTotal.toFixed(2)),
        valorVencido: parseFloat(valorVencido.toFixed(2)),
        taxaInadimplencia,
      },
      lembretes: {
        total: todosLembretes.length,
        enviados: todosLembretes.filter(l => l.status === 'enviado').length,
        falhos: todosLembretes.filter(l => l.status === 'falhou').length,
      },
    };
  }

  async deletarRegra(id: string) {
    await this.prisma.cobrancaRegra.delete({ where: { id } });
    return { success: true };
  }
}
