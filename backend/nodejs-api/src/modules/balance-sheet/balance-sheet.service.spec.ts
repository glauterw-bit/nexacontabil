import { Test, TestingModule } from '@nestjs/testing';
import { BalanceSheetService } from './balance-sheet.service';
import { PrismaService } from '../../database/prisma.service';

describe('BalanceSheetService', () => {
  let service: BalanceSheetService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn() },
      chartAccount: { findMany: jest.fn() },
      transaction: { findMany: jest.fn() },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSheetService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(BalanceSheetService);
  });

  it('lança quando companyId vazio', async () => {
    await expect(service.compute('')).rejects.toThrow();
  });

  it('agrupa contas em ativo/passivo/PL e fecha quando débitos = créditos', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
    prisma.chartAccount.findMany.mockResolvedValue([
      { codigo: '1.1.01.001', nome: 'Caixa',          tipo: 'ativo',      natureza: 'devedora', active: true },
      { codigo: '1.2.01.001', nome: 'Imobilizado',    tipo: 'ativo',      natureza: 'devedora', active: true },
      { codigo: '2.1.01.001', nome: 'Fornecedores',   tipo: 'passivo',    natureza: 'credora',  active: true },
      { codigo: '2.3.01.001', nome: 'Capital Social', tipo: 'patrimonio', natureza: 'credora',  active: true },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        entries: JSON.stringify([
          { accountCode: '1.1.01.001', nature: 'debit',  value: 1000 },
          { accountCode: '2.3.01.001', nature: 'credit', value: 1000 },
        ]),
        totalDebit: 1000, totalCredit: 1000,
      },
      {
        entries: JSON.stringify([
          { accountCode: '1.2.01.001', nature: 'debit',  value: 500 },
          { accountCode: '2.1.01.001', nature: 'credit', value: 500 },
        ]),
        totalDebit: 500, totalCredit: 500,
      },
    ]);

    const bs = await service.compute('c1');

    expect(bs.totalAtivo).toBe(1500);
    expect(bs.totalPassivo).toBe(500);
    expect(bs.totalPatrimonioLiquido).toBe(1000);
    expect(bs.totalPassivoEPatrimonio).toBe(1500);
    expect(bs.balanceado).toBe(true);
    expect(bs.grupos.ativoCirculante.total).toBe(1000);
    expect(bs.grupos.ativoNaoCirculante.total).toBe(500);
  });

  it('marca como não balanceado quando há diferença', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
    prisma.chartAccount.findMany.mockResolvedValue([
      { codigo: '1.1.01.001', nome: 'Caixa', tipo: 'ativo', natureza: 'devedora', active: true },
      { codigo: '2.3.01.001', nome: 'Capital', tipo: 'patrimonio', natureza: 'credora', active: true },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        entries: JSON.stringify([
          { accountCode: '1.1.01.001', nature: 'debit', value: 1000 },
          { accountCode: '2.3.01.001', nature: 'credit', value: 800 },
        ]),
        totalDebit: 1000, totalCredit: 800,
      },
    ]);
    const bs = await service.compute('c1');
    expect(bs.balanceado).toBe(false);
    expect(bs.diferenca).toBe(200);
  });

  it('ignora transações não aprovadas (filtra por status no findMany)', async () => {
    // service passa { status: { in: [...] } } pro findMany — confirmamos
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
    prisma.chartAccount.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    await service.compute('c1');
    const callArg = prisma.transaction.findMany.mock.calls[0][0];
    expect(callArg.where.status.in).toEqual(expect.arrayContaining(['approved', 'aprovado', 'paid']));
  });

  it('getMetrics retorna liquidez null quando passivo circulante = 0', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Acme' });
    prisma.chartAccount.findMany.mockResolvedValue([
      { codigo: '1.1.01.001', nome: 'Caixa', tipo: 'ativo', natureza: 'devedora', active: true },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      {
        entries: JSON.stringify([{ accountCode: '1.1.01.001', nature: 'debit', value: 100 }]),
        totalDebit: 100, totalCredit: 0,
      },
    ]);
    const m = await service.getMetrics('c1');
    expect(m.liquidezCorrente).toBeNull();
  });
});
