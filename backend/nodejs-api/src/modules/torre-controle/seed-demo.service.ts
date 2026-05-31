import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { STAGES } from '../workflow/workflow.service';

/**
 * Popula o escritório com dados de demonstração realistas pra a Torre de
 * Controle aparecer cheia. Tudo marcado pra limpeza fácil:
 *   - usuários demo: email termina em @nexademo.local
 *   - empresas demo: cnpj começa com '99999000'
 */
const DEMO_EMAIL = '@nexademo.local';
const DEMO_CNPJ_PREFIX = '99999000';
const SENHA_DEMO = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; // bcrypt placeholder

const ANALISTAS = [
  { nome: 'Ana Paula Ferreira', role: 'contador' },
  { nome: 'Carlos Eduardo Silva', role: 'assistente' },
  { nome: 'Mariana Costa', role: 'contador' },
  { nome: 'Rafael Almeida', role: 'assistente' },
  { nome: 'Juliana Santos', role: 'contador' },
];

const EMPRESAS = [
  { name: 'Padaria Pão Quente Ltda', seg: 'comercio', uf: 'SP' },
  { name: 'Mercado São Jorge', seg: 'comercio', uf: 'SP' },
  { name: 'Construtora Horizonte', seg: 'servico', uf: 'MG' },
  { name: 'TechWeb Sistemas', seg: 'servico', uf: 'SP' },
  { name: 'Restaurante Sabor Caseiro', seg: 'comercio', uf: 'RJ' },
  { name: 'Auto Peças Veloz', seg: 'comercio', uf: 'PR' },
  { name: 'Farmácia Vida', seg: 'comercio', uf: 'SP' },
  { name: 'Studio Beleza & Cia', seg: 'servico', uf: 'SP' },
  { name: 'Transportadora Rápida', seg: 'transporte', uf: 'SC' },
  { name: 'Clínica Bem Estar', seg: 'servico', uf: 'RJ' },
  { name: 'Loja Moda Fina', seg: 'comercio', uf: 'SP' },
  { name: 'Indústria Metalúrgica Forte', seg: 'industria', uf: 'MG' },
  { name: 'Distribuidora Norte', seg: 'comercio', uf: 'BA' },
  { name: 'Oficina do Zé', seg: 'servico', uf: 'SP' },
];

// quantos clientes cada analista recebe (deixa 2 empresas sem responsável de propósito)
const CARTEIRA = [4, 3, 2, 2, 1];

@Injectable()
export class SeedDemoService {
  constructor(private readonly prisma: PrismaService) {}

  private comp(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async seed(seededById: string) {
    await this.limpar();
    const now = new Date();
    const competencia = this.comp();

    // ── usuários ──────────────────────────────────────────
    const users: any[] = [];
    for (let i = 0; i < ANALISTAS.length; i++) {
      const a = ANALISTAS[i];
      const email = `${a.nome.toLowerCase().split(' ')[0]}.${i}${DEMO_EMAIL}`;
      users.push(await this.prisma.user.create({
        data: { name: a.nome, email, password: SENHA_DEMO, role: a.role, active: true },
      }));
    }

    // ── empresas ──────────────────────────────────────────
    const companies: any[] = [];
    for (let i = 0; i < EMPRESAS.length; i++) {
      const e = EMPRESAS[i];
      const cnpj = `${DEMO_CNPJ_PREFIX}${String(i + 1).padStart(6, '0')}`;
      companies.push(await this.prisma.company.create({
        data: {
          name: e.name, cnpj, taxRegime: 'SIMPLES_NACIONAL', active: true,
          uf: e.uf, segmentoFiscal: e.seg,
          email: `contato@${e.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.demo`,
          whatsappNumber: `5511${90000000 + i}`,
        },
      }));
    }

    // ── carteira (assignments) ───────────────────────────
    let ci = 0;
    for (let ui = 0; ui < users.length; ui++) {
      for (let k = 0; k < CARTEIRA[ui] && ci < companies.length; k++, ci++) {
        await this.prisma.clientAssignment.create({
          data: { companyId: companies[ci].id, analystId: users[ui].id, assignedById: seededById, active: true },
        });
      }
    }
    const assignedCompanies = companies.slice(0, ci); // resto fica sem responsável

    // mapa empresa→analista
    const respDe = new Map<string, string>();
    ci = 0;
    for (let ui = 0; ui < users.length; ui++) for (let k = 0; k < CARTEIRA[ui] && ci < companies.length; k++, ci++) respDe.set(companies[ci].id, users[ui].id);

    // ── tarefas de workflow (vários estágios/status) ─────
    let tasks = 0, concl = 0;
    const rnd = mulberry32(42);
    for (const comp of assignedCompanies) {
      const analystId = respDe.get(comp.id)!;
      // cada empresa avança até um estágio aleatório
      const ateEstagio = 2 + Math.floor(rnd() * 5); // 2..6
      for (let s = 0; s < STAGES.length; s++) {
        const stage = STAGES[s];
        let status = 'pendente';
        let completedAt: Date | null = null;
        let completedBy: string | null = null;
        let startedAt: Date | null = null;
        let tempoSegundos: number | null = null;
        const slaDate = new Date(now.getTime() + (s - 2) * 2 * 86400000); // alguns no passado

        if (s < ateEstagio) {
          status = 'concluida';
          startedAt = new Date(now.getTime() - (8 - s) * 86400000);
          completedAt = new Date(now.getTime() - (6 - s) * 86400000 - Math.floor(rnd() * 86400000));
          completedBy = analystId;
          tempoSegundos = 3600 + Math.floor(rnd() * 80000);
          concl++;
        } else if (s === ateEstagio) {
          status = rnd() > 0.7 ? 'bloqueada' : 'em_andamento';
          startedAt = new Date(now.getTime() - 2 * 86400000);
        }
        await this.prisma.workflowTask.create({
          data: {
            companyId: comp.id, analystId, stage: stage.key, competencia, status,
            prioridade: rnd() > 0.85 ? 'alta' : 'normal',
            slaDate, startedAt, completedAt, completedBy, tempoSegundos,
            blockedReason: status === 'bloqueada' ? 'Aguardando documento do cliente' : null,
          },
        });
        tasks++;
      }
    }

    // ── pendências: obrigações vencidas ──────────────────
    const OBRIGS = ['DAS Simples Nacional', 'DCTFWeb', 'EFD-Reinf', 'FGTS Digital', 'GIA Estadual', 'DEFIS'];
    let obrig = 0;
    for (let i = 0; i < assignedCompanies.length; i++) {
      if (rnd() > 0.55) continue;
      const comp = assignedCompanies[i];
      await this.prisma.fiscalObligation.create({
        data: {
          companyId: comp.id, name: OBRIGS[i % OBRIGS.length], type: 'federal',
          dueDate: new Date(now.getTime() - (1 + Math.floor(rnd() * 25)) * 86400000),
          referenceMonth: competencia, status: 'pending',
          responsavel: respDe.has(comp.id) ? ANALISTAS[0].nome : undefined,
        },
      });
      obrig++;
    }

    // ── pendências: honorários atrasados ─────────────────
    let honor = 0;
    for (let i = 0; i < assignedCompanies.length; i += 3) {
      const comp = assignedCompanies[i];
      await this.prisma.honorario.create({
        data: {
          companyId: comp.id, descricao: 'Honorário contábil mensal', competencia,
          valor: 450 + Math.floor(rnd() * 800),
          vencimento: new Date(now.getTime() - (3 + Math.floor(rnd() * 20)) * 86400000),
          status: 'pendente',
        },
      });
      honor++;
    }

    // ── boletos (inadimplência) ──────────────────────────
    let boletos = 0;
    for (let i = 0; i < assignedCompanies.length; i++) {
      const comp = assignedCompanies[i];
      const vencido = rnd() > 0.6;
      await this.prisma.boleto.create({
        data: {
          companyId: comp.id, beneficiaryName: 'Escritório Contábil', beneficiaryCnpj: '11222333000181',
          payerName: comp.name, payerCnpjCpf: comp.cnpj, amount: 300 + Math.floor(rnd() * 600),
          dueDate: new Date(now.getTime() + (vencido ? -1 : 1) * (1 + Math.floor(rnd() * 15)) * 86400000),
          ourNumber: `DEMO${Date.now()}${i}`, status: rnd() > 0.7 ? 'paid' : 'pending',
          paidAt: rnd() > 0.7 ? now : null,
        },
      });
      boletos++;
    }

    // ── envios de relatório (docs enviados + feed) ───────
    let envios = 0;
    for (let i = 0; i < assignedCompanies.length; i++) {
      if (rnd() > 0.6) continue;
      const comp = assignedCompanies[i];
      const canal = rnd() > 0.5 ? 'email' : 'whatsapp';
      await this.prisma.relatorioEnvio.create({
        data: {
          companyId: comp.id, canal, destino: canal === 'email' ? `contato@${comp.name.slice(0, 6)}.demo` : '5511999990000',
          assunto: 'Relatório fiscal mensal', corpo: 'Relatório de demonstração', status: 'enviado',
        },
      });
      envios++;
    }

    // ── notificações pro feed ────────────────────────────
    for (let i = 0; i < 4 && i < assignedCompanies.length; i++) {
      await this.prisma.notification.create({
        data: {
          companyId: assignedCompanies[i].id, tipo: i % 2 ? 'sla_vencendo' : 'tarefa_atribuida',
          titulo: i % 2 ? `SLA vencendo · ${assignedCompanies[i].name}` : `Tarefa atribuída a ${ANALISTAS[i % ANALISTAS.length].nome}`,
          corpo: 'Evento de demonstração',
        },
      });
    }

    return {
      ok: true,
      criados: { analistas: users.length, empresas: companies.length, semResponsavel: companies.length - assignedCompanies.length,
        tarefas: tasks, concluidas: concl, obrigacoesVencidas: obrig, honorariosAtraso: honor, boletos, envios },
      competencia,
    };
  }

  async limpar() {
    const demoCompanies = await this.prisma.company.findMany({
      where: { cnpj: { startsWith: DEMO_CNPJ_PREFIX } }, select: { id: true },
    });
    const ids = demoCompanies.map((c) => c.id);
    if (ids.length) {
      const w = { companyId: { in: ids } };
      await this.prisma.workflowTask.deleteMany({ where: w });
      await this.prisma.clientAssignment.deleteMany({ where: w });
      await this.prisma.fiscalObligation.deleteMany({ where: w });
      await this.prisma.honorario.deleteMany({ where: w });
      await this.prisma.boleto.deleteMany({ where: w });
      await this.prisma.relatorioEnvio.deleteMany({ where: w });
      await this.prisma.notification.deleteMany({ where: w });
      await this.prisma.company.deleteMany({ where: { id: { in: ids } } });
    }
    const del = await this.prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL } } });
    return { empresasRemovidas: ids.length, analistasRemovidos: del.count };
  }
}

/** PRNG determinístico (seed fixo = mesmo resultado, sem Math.random no boot). */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
