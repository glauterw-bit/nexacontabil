import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateBankConnectionDto {
  companyId: string;
  bankName: string;
  bankCode: string;
  accountType?: string;
}

// Categorias para classificação automática de transações bancárias
const TRANSACTION_CATEGORIES: Record<string, string> = {
  salario: 'Folha de Pagamento',
  folha: 'Folha de Pagamento',
  fornecedor: 'Fornecedores',
  nota: 'Notas Fiscais',
  imposto: 'Impostos',
  das: 'Simples Nacional',
  darf: 'Impostos Federais',
  fgts: 'FGTS',
  inss: 'INSS',
  aluguel: 'Aluguel',
  energia: 'Energia Elétrica',
  agua: 'Água',
  internet: 'Internet/Telecom',
  cliente: 'Receita de Clientes',
  pix: 'Transferências PIX',
  ted: 'Transferências TED',
  doc: 'Transferências DOC',
};

@Injectable()
export class BankingService {
  constructor(private readonly prisma: PrismaService) {}

  private _categorize(description: string): string {
    const lower = description.toLowerCase();
    for (const [keyword, category] of Object.entries(TRANSACTION_CATEGORIES)) {
      if (lower.includes(keyword)) return category;
    }
    return 'Outros';
  }

  /**
   * Gera transações sintéticas realistas baseadas nas transações contábeis existentes.
   * Em produção, integraria com Open Banking (API do Banco Central do Brasil) ou
   * scraping bancário via Pluggy/Belvo.
   */
  private async _generateSyntheticStatements(
    connectionId: string,
    companyId: string,
    daysBack: number = 30,
  ) {
    // Busca transações contábeis aprovadas como base para os dados sintéticos
    const existingTx = await this.prisma.transaction.findMany({
      where: { companyId, status: 'approved' },
      take: 20,
      orderBy: { date: 'desc' },
    });

    const statements: Array<{
      companyId: string;
      connectionId: string;
      date: Date;
      description: string;
      amount: number;
      type: string;
      balance: number;
      category: string;
      reconciled: boolean;
    }> = [];

    let runningBalance = 50000; // saldo inicial fictício
    const now = new Date();

    // Usa as transações existentes como base, complementando com sintéticos
    const seedDescriptions = existingTx.length > 0
      ? existingTx.map(tx => ({ description: tx.description, value: tx.totalDebit }))
      : [
          { description: 'Recebimento de cliente - NF 001', value: 5000 },
          { description: 'Pagamento fornecedor - Suprimentos', value: 2000 },
          { description: 'DAS - Simples Nacional', value: 800 },
          { description: 'Aluguel escritório', value: 1500 },
          { description: 'Folha de pagamento', value: 8000 },
          { description: 'FGTS - Recolhimento', value: 640 },
          { description: 'Internet e telecom', value: 350 },
          { description: 'Energia elétrica', value: 420 },
        ];

    for (let i = daysBack; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      // Gera 1-3 movimentos por dia com base nos seeds
      const movementsCount = 1 + Math.floor(Math.random() * 2);
      for (let m = 0; m < movementsCount; m++) {
        const seed = seedDescriptions[Math.floor(Math.random() * seedDescriptions.length)];
        const isCredit = Math.random() > 0.55; // ~45% créditos, ~55% débitos
        const amount = Math.round(seed.value * (0.8 + Math.random() * 0.4) * 100) / 100;
        const signedAmount = isCredit ? amount : -amount;
        runningBalance += signedAmount;

        statements.push({
          companyId,
          connectionId,
          date: new Date(date),
          description: seed.description,
          amount: signedAmount,
          type: isCredit ? 'credit' : 'debit',
          balance: Math.round(runningBalance * 100) / 100,
          category: this._categorize(seed.description),
          reconciled: false,
        });
      }
    }

    return statements;
  }

  async createConnection(dto: CreateBankConnectionDto) {
    return this.prisma.bankConnection.create({
      data: {
        companyId: dto.companyId,
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        accountType: dto.accountType,
        status: 'active',
      },
    });
  }

  async findConnections(companyId: string) {
    return this.prisma.bankConnection.findMany({
      where: { companyId },
      include: { statements: { take: 5, orderBy: { date: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findConnection(id: string) {
    const conn = await this.prisma.bankConnection.findUnique({
      where: { id },
      include: { statements: { orderBy: { date: 'desc' }, take: 100 } },
    });
    if (!conn) throw new NotFoundException(`Conexão bancária ${id} não encontrada`);
    return conn;
  }

  async syncBankStatements(connectionId: string) {
    const connection = await this.prisma.bankConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) throw new NotFoundException(`Conexão ${connectionId} não encontrada`);

    const synthetic = await this._generateSyntheticStatements(
      connectionId,
      connection.companyId,
      30,
    );

    // Persiste os extratos sintéticos
    await this.prisma.bankStatement.createMany({ data: synthetic });

    // Atualiza timestamp da última sincronização
    await this.prisma.bankConnection.update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    });

    const statements = await this.prisma.bankStatement.findMany({
      where: { connectionId },
      orderBy: { date: 'desc' },
      take: 100,
    });

    return {
      connectionId,
      syncedCount: synthetic.length,
      lastSyncAt: new Date().toISOString(),
      statements,
    };
  }

  async getStatements(connectionId: string, from?: Date, to?: Date) {
    return this.prisma.bankStatement.findMany({
      where: {
        connectionId,
        ...(from && { date: { gte: from } }),
        ...(to && { date: { lte: to } }),
      },
      orderBy: { date: 'desc' },
    });
  }
}
