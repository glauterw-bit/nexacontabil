import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface CreateChartAccountDto {
  companyId: string;
  codigo: string;
  nome: string;
  tipo: 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa' | 'conta_resultado';
  natureza: 'devedora' | 'credora';
  grau: number;
  parentId?: string;
  permiteLancamento?: boolean;
  spedCode?: string;
}

@Injectable()
export class ChartAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, tipo?: string) {
    return this.prisma.chartAccount.findMany({
      where: { companyId, ...(tipo ? { tipo } : {}) },
      orderBy: { codigo: 'asc' },
    });
  }

  async tree(companyId: string) {
    const all = await this.prisma.chartAccount.findMany({
      where: { companyId, active: true },
      orderBy: { codigo: 'asc' },
    });
    const byId = new Map<string, any>(all.map((a) => [a.id, { ...a, children: [] }]));
    const roots: any[] = [];
    for (const acc of byId.values()) {
      if (acc.parentId && byId.has(acc.parentId)) {
        byId.get(acc.parentId).children.push(acc);
      } else {
        roots.push(acc);
      }
    }
    return roots;
  }

  async create(dto: CreateChartAccountDto) {
    try {
      return await this.prisma.chartAccount.create({ data: dto });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Codigo ja existe para essa empresa');
      throw e;
    }
  }

  async update(id: string, patch: Partial<CreateChartAccountDto> & { active?: boolean }) {
    const exists = await this.prisma.chartAccount.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    return this.prisma.chartAccount.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    const children = await this.prisma.chartAccount.count({ where: { parentId: id } });
    if (children > 0) {
      return this.prisma.chartAccount.update({ where: { id }, data: { active: false } });
    }
    return this.prisma.chartAccount.delete({ where: { id } });
  }

  async seedPCASP(companyId: string) {
    const existing = await this.prisma.chartAccount.count({ where: { companyId } });
    if (existing > 0) return { seeded: false, reason: 'Empresa ja possui plano de contas' };
    const seeds = PCASP_BASE.map((row) => ({ companyId, ...row }));
    await this.prisma.chartAccount.createMany({ data: seeds });
    const accounts = await this.prisma.chartAccount.findMany({ where: { companyId } });
    const byCodigo = new Map(accounts.map((a) => [a.codigo, a.id]));
    for (const row of PCASP_BASE) {
      const parentCodigo = row.codigo.split('.').slice(0, -1).join('.');
      if (parentCodigo && byCodigo.has(parentCodigo)) {
        const acc = byCodigo.get(row.codigo)!;
        await this.prisma.chartAccount.update({
          where: { id: acc },
          data: { parentId: byCodigo.get(parentCodigo)! },
        });
      }
    }
    return { seeded: true, count: seeds.length };
  }
}

// Plano de contas brasileiro simplificado (PCASP/SPED-Contabil compatible base).
// Fonte: estrutura recomendada da Receita Federal para ECD.
const PCASP_BASE: Array<{
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  grau: number;
  permiteLancamento?: boolean;
  spedCode?: string;
}> = [
  // ATIVO
  { codigo: '1', nome: 'ATIVO', tipo: 'ativo', natureza: 'devedora', grau: 1, permiteLancamento: false },
  { codigo: '1.1', nome: 'ATIVO CIRCULANTE', tipo: 'ativo', natureza: 'devedora', grau: 2, permiteLancamento: false },
  { codigo: '1.1.01', nome: 'Disponibilidades', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.1.01.001', nome: 'Caixa Geral', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.01.002', nome: 'Bancos Conta Movimento', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.01.003', nome: 'Aplicacoes Financeiras de Liquidez Imediata', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.02', nome: 'Clientes', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.1.02.001', nome: 'Duplicatas a Receber', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.02.002', nome: '(-) Provisao para Credito de Liquidacao Duvidosa', tipo: 'ativo', natureza: 'credora', grau: 4 },
  { codigo: '1.1.03', nome: 'Estoques', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.1.03.001', nome: 'Mercadorias para Revenda', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.03.002', nome: 'Materia-Prima', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.04', nome: 'Impostos a Recuperar', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.1.04.001', nome: 'IRRF a Recuperar', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.04.002', nome: 'ICMS a Recuperar', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.04.003', nome: 'PIS a Recuperar', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.1.04.004', nome: 'COFINS a Recuperar', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2', nome: 'ATIVO NAO CIRCULANTE', tipo: 'ativo', natureza: 'devedora', grau: 2, permiteLancamento: false },
  { codigo: '1.2.01', nome: 'Imobilizado', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.2.01.001', nome: 'Maquinas e Equipamentos', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2.01.002', nome: 'Moveis e Utensilios', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2.01.003', nome: 'Veiculos', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2.01.004', nome: 'Computadores e Perifericos', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2.01.099', nome: '(-) Depreciacao Acumulada', tipo: 'ativo', natureza: 'credora', grau: 4 },
  { codigo: '1.2.02', nome: 'Intangivel', tipo: 'ativo', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '1.2.02.001', nome: 'Software', tipo: 'ativo', natureza: 'devedora', grau: 4 },
  { codigo: '1.2.02.099', nome: '(-) Amortizacao Acumulada', tipo: 'ativo', natureza: 'credora', grau: 4 },

  // PASSIVO
  { codigo: '2', nome: 'PASSIVO', tipo: 'passivo', natureza: 'credora', grau: 1, permiteLancamento: false },
  { codigo: '2.1', nome: 'PASSIVO CIRCULANTE', tipo: 'passivo', natureza: 'credora', grau: 2, permiteLancamento: false },
  { codigo: '2.1.01', nome: 'Fornecedores', tipo: 'passivo', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.1.01.001', nome: 'Fornecedores Nacionais', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02', nome: 'Obrigacoes Tributarias', tipo: 'passivo', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.1.02.001', nome: 'ICMS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.002', nome: 'ISS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.003', nome: 'PIS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.004', nome: 'COFINS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.005', nome: 'IRPJ a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.006', nome: 'CSLL a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.02.007', nome: 'DAS Simples Nacional a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03', nome: 'Obrigacoes Trabalhistas', tipo: 'passivo', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.1.03.001', nome: 'Salarios a Pagar', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03.002', nome: 'INSS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03.003', nome: 'FGTS a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03.004', nome: 'IRRF s/ Salarios a Recolher', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03.005', nome: '13o Salario a Pagar', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.1.03.006', nome: 'Ferias a Pagar', tipo: 'passivo', natureza: 'credora', grau: 4 },
  { codigo: '2.2', nome: 'PASSIVO NAO CIRCULANTE', tipo: 'passivo', natureza: 'credora', grau: 2, permiteLancamento: false },
  { codigo: '2.2.01', nome: 'Emprestimos e Financiamentos', tipo: 'passivo', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.2.01.001', nome: 'Emprestimos Bancarios LP', tipo: 'passivo', natureza: 'credora', grau: 4 },

  // PATRIMONIO LIQUIDO
  { codigo: '2.3', nome: 'PATRIMONIO LIQUIDO', tipo: 'patrimonio', natureza: 'credora', grau: 2, permiteLancamento: false },
  { codigo: '2.3.01', nome: 'Capital Social', tipo: 'patrimonio', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.3.01.001', nome: 'Capital Social Integralizado', tipo: 'patrimonio', natureza: 'credora', grau: 4 },
  { codigo: '2.3.02', nome: 'Reservas', tipo: 'patrimonio', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.3.02.001', nome: 'Reserva Legal', tipo: 'patrimonio', natureza: 'credora', grau: 4 },
  { codigo: '2.3.02.002', nome: 'Reservas de Lucros', tipo: 'patrimonio', natureza: 'credora', grau: 4 },
  { codigo: '2.3.03', nome: 'Lucros / Prejuizos Acumulados', tipo: 'patrimonio', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '2.3.03.001', nome: 'Lucros Acumulados', tipo: 'patrimonio', natureza: 'credora', grau: 4 },
  { codigo: '2.3.03.002', nome: 'Prejuizos Acumulados', tipo: 'patrimonio', natureza: 'devedora', grau: 4 },

  // RECEITAS
  { codigo: '3', nome: 'RECEITAS', tipo: 'receita', natureza: 'credora', grau: 1, permiteLancamento: false },
  { codigo: '3.1', nome: 'Receita Operacional Bruta', tipo: 'receita', natureza: 'credora', grau: 2, permiteLancamento: false },
  { codigo: '3.1.01', nome: 'Vendas de Mercadorias', tipo: 'receita', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '3.1.01.001', nome: 'Vendas no Mercado Interno', tipo: 'receita', natureza: 'credora', grau: 4 },
  { codigo: '3.1.02', nome: 'Receita de Servicos', tipo: 'receita', natureza: 'credora', grau: 3, permiteLancamento: false },
  { codigo: '3.1.02.001', nome: 'Servicos Prestados', tipo: 'receita', natureza: 'credora', grau: 4 },
  { codigo: '3.2', nome: '(-) Deducoes da Receita Bruta', tipo: 'receita', natureza: 'devedora', grau: 2, permiteLancamento: false },
  { codigo: '3.2.01.001', nome: 'ICMS sobre Vendas', tipo: 'receita', natureza: 'devedora', grau: 4 },
  { codigo: '3.2.01.002', nome: 'ISS sobre Servicos', tipo: 'receita', natureza: 'devedora', grau: 4 },
  { codigo: '3.2.01.003', nome: 'PIS sobre Faturamento', tipo: 'receita', natureza: 'devedora', grau: 4 },
  { codigo: '3.2.01.004', nome: 'COFINS sobre Faturamento', tipo: 'receita', natureza: 'devedora', grau: 4 },
  { codigo: '3.2.01.005', nome: 'Devolucoes de Vendas', tipo: 'receita', natureza: 'devedora', grau: 4 },

  // DESPESAS / CUSTOS
  { codigo: '4', nome: 'CUSTOS E DESPESAS', tipo: 'despesa', natureza: 'devedora', grau: 1, permiteLancamento: false },
  { codigo: '4.1', nome: 'Custo das Mercadorias e Servicos', tipo: 'despesa', natureza: 'devedora', grau: 2, permiteLancamento: false },
  { codigo: '4.1.01.001', nome: 'CMV - Custo Mercadoria Vendida', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.1.02.001', nome: 'Custo dos Servicos Prestados', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2', nome: 'Despesas Operacionais', tipo: 'despesa', natureza: 'devedora', grau: 2, permiteLancamento: false },
  { codigo: '4.2.01', nome: 'Despesas Administrativas', tipo: 'despesa', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '4.2.01.001', nome: 'Salarios e Ordenados', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.002', nome: 'Encargos Sociais (INSS Patronal)', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.003', nome: 'FGTS Patronal', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.004', nome: 'Aluguel', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.005', nome: 'Energia Eletrica', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.006', nome: 'Internet e Telefonia', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.007', nome: 'Material de Escritorio', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.01.008', nome: 'Honorarios Contabeis', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.02', nome: 'Despesas Comerciais', tipo: 'despesa', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '4.2.02.001', nome: 'Marketing e Publicidade', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.02.002', nome: 'Comissoes sobre Vendas', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.03', nome: 'Despesas Financeiras', tipo: 'despesa', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '4.2.03.001', nome: 'Juros e Multas', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.03.002', nome: 'Tarifas Bancarias', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.04', nome: 'Depreciacoes e Amortizacoes', tipo: 'despesa', natureza: 'devedora', grau: 3, permiteLancamento: false },
  { codigo: '4.2.04.001', nome: 'Despesas de Depreciacao', tipo: 'despesa', natureza: 'devedora', grau: 4 },
  { codigo: '4.2.04.002', nome: 'Despesas de Amortizacao', tipo: 'despesa', natureza: 'devedora', grau: 4 },

  // Conta de resultado (para encerramento)
  { codigo: '5', nome: 'APURACAO DO RESULTADO', tipo: 'conta_resultado', natureza: 'credora', grau: 1, permiteLancamento: false },
  { codigo: '5.1.01.001', nome: 'Apuracao do Resultado do Exercicio', tipo: 'conta_resultado', natureza: 'credora', grau: 4 },
];
