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

    // ── folha: colaboradores + holerites ─────────────────
    const CARGOS = ['Vendedor', 'Auxiliar Adm.', 'Gerente', 'Caixa', 'Estoquista', 'Analista'];
    const NOMES_F = ['Bruno Lima', 'Camila Rocha', 'Diego Souza', 'Elaine Martins', 'Felipe Nunes', 'Gabriela Dias', 'Hugo Pereira', 'Isabela Castro'];
    let funcionarios = 0, holerites = 0;
    for (let ci2 = 0; ci2 < assignedCompanies.length; ci2++) {
      const comp = assignedCompanies[ci2];
      const nfunc = 2 + Math.floor(rnd() * 2);
      for (let f = 0; f < nfunc; f++) {
        const salario = 1800 + Math.floor(rnd() * 4000);
        const emp = await this.prisma.employee.create({
          data: {
            companyId: comp.id, name: NOMES_F[(ci2 + f) % NOMES_F.length],
            cpf: String(10000000000 + ci2 * 137 + f * 31).slice(0, 11),
            role: CARGOS[(ci2 + f) % CARGOS.length], department: 'Operacional',
            admissionDate: new Date(now.getFullYear() - 1 - Math.floor(rnd() * 3), Math.floor(rnd() * 12), 1),
            baseSalary: salario, dependents: Math.floor(rnd() * 3), active: true,
          },
        });
        funcionarios++;
        const inss = round2(salario * 0.09);
        const irrf = salario > 2800 ? round2((salario - inss) * 0.075) : 0;
        await this.prisma.payslip.create({
          data: {
            companyId: comp.id, employeeId: emp.id, referenceMonth: competencia,
            baseSalary: salario, overtimeHours: rnd() > 0.7 ? 8 : 0, overtimeValue: 0,
            inssEmployee: inss, inssEmployer: round2(salario * 0.2), irrf, fgts: round2(salario * 0.08),
            grossSalary: salario, netSalary: round2(salario - inss - irrf), breakdown: '{}',
            status: rnd() > 0.4 ? 'approved' : 'draft',
          },
        });
        holerites++;
      }
    }

    // ── plano de contas + lançamentos (DRE / balanço / fluxo) ──
    const PLANO = [
      { codigo: '1.1.01.001', nome: 'Caixa e Bancos', tipo: 'ativo', natureza: 'devedora' },
      { codigo: '1.1.02.001', nome: 'Clientes', tipo: 'ativo', natureza: 'devedora' },
      { codigo: '2.1.01.001', nome: 'Fornecedores', tipo: 'passivo', natureza: 'credora' },
      { codigo: '2.3.01.001', nome: 'Capital Social', tipo: 'patrimonio', natureza: 'credora' },
      { codigo: '3.1.01.001', nome: 'Receita de Vendas', tipo: 'receita', natureza: 'credora' },
      { codigo: '4.1.01.001', nome: 'Despesas Operacionais', tipo: 'despesa', natureza: 'devedora' },
    ];
    let lancamentos = 0;
    const mkTx = async (comp: any, date: Date, entries: any[], desc: string) => {
      const td = entries.filter((e) => e.nature === 'debit').reduce((s, e) => s + e.value, 0);
      const tc = entries.filter((e) => e.nature === 'credit').reduce((s, e) => s + e.value, 0);
      await this.prisma.transaction.create({
        data: { companyId: comp.id, description: desc, date, status: 'approved', entries: JSON.stringify(entries), totalDebit: round2(td), totalCredit: round2(tc), isBalanced: true },
      });
      lancamentos++;
    };
    for (const comp of assignedCompanies) {
      for (const p of PLANO) {
        await this.prisma.chartAccount.create({
          data: { companyId: comp.id, codigo: p.codigo, nome: p.nome, tipo: p.tipo, natureza: p.natureza, grau: 3, active: true, permiteLancamento: true },
        });
      }
      // capital inicial
      await mkTx(comp, new Date(now.getFullYear(), 0, 2), [
        { accountCode: '1.1.01.001', nature: 'debit', value: 50000 },
        { accountCode: '2.3.01.001', nature: 'credit', value: 50000 },
      ], 'Integralização de capital');
      // vendas e despesas nos últimos 3 meses
      for (let mAgo = 2; mAgo >= 0; mAgo--) {
        const d = new Date(now.getFullYear(), now.getMonth() - mAgo, 10);
        const venda = 8000 + Math.floor(rnd() * 25000);
        await mkTx(comp, d, [
          { accountCode: '1.1.01.001', nature: 'debit', value: venda },
          { accountCode: '3.1.01.001', nature: 'credit', value: venda },
        ], 'Receita de vendas');
        const desp = 3000 + Math.floor(rnd() * 12000);
        await mkTx(comp, new Date(now.getFullYear(), now.getMonth() - mAgo, 18), [
          { accountCode: '4.1.01.001', nature: 'debit', value: desp },
          { accountCode: '1.1.01.001', nature: 'credit', value: desp },
        ], 'Despesas operacionais');
      }
    }

    // ── Banco de NCM (regras demo) ───────────────────────
    const NCMS = [
      { ncm: '22021000', descricao: 'Refrigerantes', seg: 'comercio', icms: 18, st: true, mva: 40, ipi: 0, pis: 1.65, cofins: 7.6, cfop: '5405' },
      { ncm: '19059090', descricao: 'Produtos de padaria', seg: 'comercio', icms: 18, st: false, mva: 0, ipi: 0, pis: 1.65, cofins: 7.6, cfop: '5102' },
      { ncm: '84713012', descricao: 'Notebooks', seg: 'comercio', icms: 18, st: false, mva: 0, ipi: 0, pis: 1.65, cofins: 7.6, cfop: '5102' },
      { ncm: '30049099', descricao: 'Medicamentos', seg: 'comercio', icms: 18, st: true, mva: 33, ipi: 0, pis: 0, cofins: 0, cfop: '5405' },
      { ncm: '27101259', descricao: 'Combustíveis', seg: 'comercio', icms: 25, st: true, mva: 0, ipi: 0, pis: 0, cofins: 0, cfop: '5656' },
      { ncm: '10063021', descricao: 'Arroz', seg: 'comercio', icms: 7, st: false, mva: 0, ipi: 0, pis: 0, cofins: 0, cfop: '5102' },
      { ncm: '87089990', descricao: 'Autopeças', seg: 'industria', icms: 18, st: true, mva: 71.78, ipi: 5, pis: 1.65, cofins: 7.6, cfop: '5405' },
      { ncm: '94036000', descricao: 'Móveis de madeira', seg: 'industria', icms: 18, st: false, mva: 0, ipi: 5, pis: 1.65, cofins: 7.6, cfop: '5101' },
      { ncm: '62034200', descricao: 'Calças de algodão', seg: 'comercio', icms: 18, st: false, mva: 0, ipi: 0, pis: 1.65, cofins: 7.6, cfop: '5102' },
      { ncm: '49019900', descricao: 'Livros', seg: 'comercio', icms: 0, st: false, mva: 0, ipi: 0, pis: 0, cofins: 0, cfop: '5102' },
    ];
    let ncmRegras = 0;
    for (const n of NCMS) {
      await this.prisma.ncmSegmentoRule.create({
        data: {
          ncm: n.ncm, descricao: n.descricao, segmento: n.seg, icmsAliquota: n.icms, icmsSt: n.st, mvaSt: n.mva,
          ipiAliquota: n.ipi, pisAliquota: n.pis, cofinsAliquota: n.cofins, cfopPadrao: n.cfop,
          origem: 'demo', confianca: 0.9, usosContador: 1 + Math.floor(rnd() * 40),
        },
      });
      ncmRegras++;
    }

    // ── notas fiscais ────────────────────────────────────
    let notas = 0;
    for (let ci3 = 0; ci3 < assignedCompanies.length; ci3++) {
      const comp = assignedCompanies[ci3];
      for (let k = 0; k < 2; k++) {
        const val = 1500 + Math.floor(rnd() * 9000);
        await this.prisma.fiscalNote.create({
          data: {
            companyId: comp.id, type: 'nfe', status: 'authorized',
            number: 1000 + ci3 * 10 + k, series: '1',
            issueDate: new Date(now.getFullYear(), now.getMonth(), 1 + Math.floor(rnd() * 25)),
            recipientName: ['Cliente Varejo Ltda', 'Atacado Central SA', 'Comércio União ME'][(ci3 + k) % 3],
            recipientCnpjCpf: String(20000000000000 + ci3 * 100 + k),
            cfop: '5102', totalValue: val, totalIcms: round2(val * 0.18),
            totalPis: round2(val * 0.0165), totalCofins: round2(val * 0.076),
            items: JSON.stringify([{ descricao: 'Produto', ncm: '19059090', quantidade: 1, valorUnitario: val, valorTotal: val }]),
          },
        });
        notas++;
      }
    }

    return {
      ok: true,
      criados: { analistas: users.length, empresas: companies.length, semResponsavel: companies.length - assignedCompanies.length,
        tarefas: tasks, concluidas: concl, obrigacoesVencidas: obrig, honorariosAtraso: honor, boletos, envios,
        funcionarios, holerites, lancamentos, ncmRegras, notas },
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
      await this.prisma.payslip.deleteMany({ where: w });
      await this.prisma.employee.deleteMany({ where: w });
      await this.prisma.transaction.deleteMany({ where: w });
      await this.prisma.chartAccount.deleteMany({ where: w });
      await this.prisma.fiscalNote.deleteMany({ where: w });
      // obrigações e documentos das demos — é o que poluía as contagens de vencidas/docs
      await this.prisma.fiscalCalendarItem.deleteMany({ where: w }).catch(() => undefined);
      await this.prisma.document.deleteMany({ where: w }).catch(() => undefined);
      await this.prisma.certificadoDigital.deleteMany({ where: w }).catch(() => undefined);
      await this.prisma.company.deleteMany({ where: { id: { in: ids } } });
    }
    await this.prisma.ncmSegmentoRule.deleteMany({ where: { origem: 'demo' } });
    const del = await this.prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL } } });
    return { empresasRemovidas: ids.length, analistasRemovidos: del.count };
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

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
