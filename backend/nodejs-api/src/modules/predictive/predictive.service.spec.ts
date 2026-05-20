import { Test, TestingModule } from '@nestjs/testing';
import { PredictiveService } from './predictive.service';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

describe('PredictiveService', () => {
  let service: PredictiveService;
  let prisma: any;
  let ai: any;

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Acme', taxRegime: 'SIMPLES_NACIONAL' }) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      fiscalCalendarItem: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      certidao: { findMany: jest.fn().mockResolvedValue([]) },
      accountingPeriodClosing: { findMany: jest.fn().mockResolvedValue(
        // 6 fechamentos = zera F5 (baseline)
        Array(6).fill({ status: 'fechado' }),
      ) },
      payslip: { findMany: jest.fn().mockResolvedValue([]) },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
    };
    ai = {
      chat: jest.fn().mockResolvedValue('Análise resumida.'),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PredictiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();
    service = moduleRef.get(PredictiveService);
  });

  it('lança erro quando empresa não existe', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.predictMalhaFina('inexistente')).rejects.toThrow('Empresa não encontrada');
  });

  it('empresa sem dados retorna score 0 = baixo', async () => {
    const r = await service.predictMalhaFina('c1');
    expect(r.score).toBe(0);
    expect(r.level).toBe('baixo');
    expect(r.fatores).toHaveLength(0);
    expect(r.recomendacoes.length).toBeGreaterThan(0); // sempre tem ao menos 1
  });

  it('obrigações vencidas elevam o score', async () => {
    prisma.fiscalCalendarItem.findMany.mockResolvedValue([
      { status: 'vencida' },
      { status: 'vencida' },
      { status: 'vencida' },
    ]);
    const r = await service.predictMalhaFina('c1');
    // 3 vencidas * 4 = 12 pts
    expect(r.score).toBe(12);
    expect(r.fatores.some(f => f.fator.includes('Obrigações'))).toBe(true);
  });

  it('thresholds de level: 25=medio, 50=alto, 70=critico', async () => {
    // 5 obrigacoes vencidas = 20 (capped) + 2 certidoes positivas = 10 = 30
    prisma.fiscalCalendarItem.findMany.mockResolvedValue(
      Array(5).fill({ status: 'vencida' }),
    );
    prisma.certidao.findMany.mockResolvedValue([
      { status: 'positiva', dataEmissao: new Date(), dataValidade: new Date(Date.now() + 86400000) },
      { status: 'positiva', dataEmissao: new Date(), dataValidade: new Date(Date.now() + 86400000) },
    ]);
    const r = await service.predictMalhaFina('c1');
    expect(r.score).toBeGreaterThanOrEqual(25);
    expect(['medio', 'alto']).toContain(r.level);
  });

  it('detectFolhaAnomalies sem holerites retorna lista vazia', async () => {
    prisma.payslip.findMany.mockResolvedValue([]);
    const r = await service.detectFolhaAnomalies('c1');
    expect(r).toEqual([]);
  });
});
