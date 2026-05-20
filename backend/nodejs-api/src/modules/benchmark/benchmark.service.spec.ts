import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkService } from './benchmark.service';
import { PrismaService } from '../../database/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { BalanceSheetService } from '../balance-sheet/balance-sheet.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;
  let prisma: any;
  let reports: any;
  let balance: any;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Acme' }) },
      employee: { count: jest.fn().mockResolvedValue(10) },
    };
    reports = {
      getDRE: jest.fn().mockResolvedValue({
        grossRevenue: 1_000_000,
        netIncome: 150_000,
        ebit: 200_000,
      }),
    };
    balance = {
      getMetrics: jest.fn().mockResolvedValue({
        patrimonioLiquido: 500_000,
        liquidezCorrente: 2.5,
        endividamento: 35,
        balanceado: true,
      }),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsService, useValue: reports },
        { provide: BalanceSheetService, useValue: balance },
      ],
    }).compile();
    service = moduleRef.get(BenchmarkService);
  });

  it('lista 7 setores BR conhecidos', () => {
    const setores = service.listSetores().map(s => s.name);
    expect(setores).toContain('Contabilidade e Consultoria');
    expect(setores).toContain('Tecnologia da Informação');
    expect(setores.length).toBe(7);
  });

  it('calcula margens corretamente quando DRE e BP estão disponíveis', async () => {
    const r = await service.compute('c1');
    // margem líquida = 150k / 1M = 15%
    expect(r.empresa.margemLiquida).toBe(15);
    // ROE = 150k / 500k = 30%
    expect(r.empresa.roe).toBe(30);
    expect(r.empresa.liquidez).toBe(2.5);
    expect(r.empresa.endividamento).toBe(35);
    // receita/funcionário = 1M/10/1000 = 100
    expect(r.empresa.receitaFuncionario).toBe(100);
  });

  it('quando BalanceSheet falha, ainda retorna métricas DRE com patrimoniais null', async () => {
    balance.getMetrics.mockRejectedValueOnce(new Error('balance not ready'));
    const r = await service.compute('c1');
    expect(r.empresa.margemLiquida).toBe(15);
    expect(r.empresa.roe).toBeNull();
    expect(r.empresa.liquidez).toBeNull();
    expect(r.empresa.endividamento).toBeNull();
  });

  it('default setor quando setorOverride inválido', async () => {
    const r = await service.compute('c1', 'setor-que-nao-existe');
    expect(r.setor).toBe('Contabilidade e Consultoria');
  });

  it('conta como "acima da média" só metricas computáveis', async () => {
    balance.getMetrics.mockResolvedValue(null); // 3 patrimoniais ficam null
    const r = await service.compute('c1');
    // 3 computáveis: margem líquida, margem ebitda, receita/func
    expect(r.totalMetricasComputaveis).toBe(3);
  });
});
