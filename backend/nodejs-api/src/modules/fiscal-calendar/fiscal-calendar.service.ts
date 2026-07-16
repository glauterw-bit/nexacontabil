import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FiscalCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCompany(companyId: string, params: { status?: string; from?: string; to?: string } = {}) {
    const where: any = { companyId };
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.dataVencimento = {};
      if (params.from) where.dataVencimento.gte = new Date(params.from);
      if (params.to) where.dataVencimento.lte = new Date(params.to);
    }
    return this.prisma.fiscalCalendarItem.findMany({
      where,
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async upcoming(companyId: string, daysAhead = 30) {
    const now = new Date();
    const limit = new Date(now);
    limit.setDate(limit.getDate() + daysAhead);
    return this.prisma.fiscalCalendarItem.findMany({
      where: {
        companyId,
        status: { in: ['pendente', 'em_apuracao', 'apurada'] },
        dataVencimento: { gte: now, lte: limit },
      },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  async create(data: any) {
    return this.prisma.fiscalCalendarItem.create({
      data: {
        ...data,
        dataVencimento: new Date(data.dataVencimento),
      },
    });
  }

  async update(id: string, patch: any) {
    const found = await this.prisma.fiscalCalendarItem.findUnique({ where: { id } });
    if (!found) throw new NotFoundException();
    const data: any = { ...patch };
    if (patch.dataVencimento) data.dataVencimento = new Date(patch.dataVencimento);
    if (patch.pagoEm) data.pagoEm = new Date(patch.pagoEm);
    return this.prisma.fiscalCalendarItem.update({ where: { id }, data });
  }

  async marcarPaga(id: string, valorPago: number, comprovanteUrl?: string) {
    return this.prisma.fiscalCalendarItem.update({
      where: { id },
      data: { status: 'paga', valorPago, comprovanteUrl, pagoEm: new Date() },
    });
  }

  /**
   * Gera obrigações fiscais recorrentes do ano para uma empresa, baseado no regime.
   * Datas 2026: DAS/PGDAS dia 20 · FGTS Digital dia 20 · DCTFWeb+MIT último dia útil · Reinf dia 15.
   * O contador ajusta depois caso necessário (ISS varia por município).
   */
  /** Último dia ÚTIL do mês (sábado/domingo recuam p/ sexta) — regra DCTFWeb desde 2025. */
  private ultimoDiaUtil(ano: number, mesIndex0: number): Date {
    const d = new Date(ano, mesIndex0 + 1, 0); // último dia do mês
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }

  async gerarAnual(companyId: string, ano: number) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa nao encontrada');

    const regime = (company.taxRegime || '').toUpperCase();
    const itens: Array<{
      tipo: string;
      descricao: string;
      competencia: string;
      dataVencimento: Date;
      recorrencia: string;
      prioridade?: string;
    }> = [];

    for (let mes = 1; mes <= 12; mes++) {
      const compMes = String(mes).padStart(2, '0');
      const competencia = `${ano}-${compMes}`;
      // Mês de competência se refere ao mês anterior; obrigações vencem no mês seguinte
      const vencMes = mes === 12 ? 1 : mes + 1;
      const vencAno = mes === 12 ? ano + 1 : ano;

      // Comuns a todos os regimes
      itens.push({
        tipo: 'FGTS',
        descricao: 'FGTS Digital (Pix, guia no portal MTE) - competencia ' + competencia,
        competencia,
        dataVencimento: new Date(vencAno, vencMes - 1, 20), // dia 20 desde o FGTS Digital (mar/2024)
        recorrencia: 'mensal',
        prioridade: 'alta',
      });
      itens.push({
        tipo: 'ESOCIAL',
        descricao: 'eSocial - envio mensal eventos S-1200/S-1210 - ' + competencia,
        competencia,
        dataVencimento: new Date(vencAno, vencMes - 1, 15),
        recorrencia: 'mensal',
        prioridade: 'alta',
      });

      // Por regime tributário
      if (regime === 'SIMPLES_NACIONAL' || regime === 'SIMPLES') {
        itens.push({
          tipo: 'DAS',
          descricao: 'DAS + PGDAS-D - competencia ' + competencia + ' (atraso na declaracao = multa 2%/mes desde 2026)',
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 20),
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
      } else if (regime === 'MEI') {
        itens.push({
          tipo: 'DAS',
          descricao: 'DAS-SIMEI MEI - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 20),
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
      } else if (regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO' || regime === 'LUCRO_REAL' || regime === 'REAL') {
        // PIS
        itens.push({
          tipo: 'DARF',
          descricao: 'DARF PIS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 25),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // COFINS
        itens.push({
          tipo: 'DARF',
          descricao: 'DARF COFINS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 25),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // ICMS estadual
        itens.push({
          tipo: 'ICMS',
          descricao: 'GIA ICMS - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 15),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
        // DCTFWeb mensal
        itens.push({
          tipo: 'DCTFWeb',
          descricao: 'DCTFWeb + MIT (IRPJ/CSLL/PIS/COFINS) - competencia ' + competencia,
          competencia,
          dataVencimento: this.ultimoDiaUtil(vencAno, vencMes - 1), // último dia útil desde a IN RFB 2.237/2024
          recorrencia: 'mensal',
          prioridade: 'critica',
        });
        // EFD-REINF
        itens.push({
          tipo: 'EFD_REINF',
          descricao: 'EFD-REINF - competencia ' + competencia,
          competencia,
          dataVencimento: new Date(vencAno, vencMes - 1, 15),
          recorrencia: 'mensal',
          prioridade: 'alta',
        });
      }
    }

    // Trimestrais (Presumido)
    if (regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO') {
      for (const tri of [1, 2, 3, 4]) {
        const ultMes = tri * 3;
        const competencia = `${ano}-T${tri}`;
        itens.push({
          tipo: 'DARF',
          descricao: `IRPJ ${tri}T${ano}`,
          competencia,
          dataVencimento: new Date(ano, ultMes, 30), // ultimo dia do mes seguinte
          recorrencia: 'trimestral',
          prioridade: 'critica',
        });
        itens.push({
          tipo: 'DARF',
          descricao: `CSLL ${tri}T${ano}`,
          competencia,
          dataVencimento: new Date(ano, ultMes, 30),
          recorrencia: 'trimestral',
          prioridade: 'critica',
        });
      }
    }

    // Anuais
    if (regime === 'SIMPLES_NACIONAL' || regime === 'SIMPLES') {
      itens.push({
        tipo: 'DEFIS',
        descricao: `DEFIS ${ano} (Simples Nacional)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 2, 31), // 31 de marco
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }
    if (regime === 'MEI') {
      itens.push({
        tipo: 'DASN-SIMEI',
        descricao: `DASN-SIMEI ${ano} (MEI)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 4, 31), // 31 de maio
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }
    if (regime === 'LUCRO_REAL' || regime === 'REAL' || regime === 'LUCRO_PRESUMIDO' || regime === 'PRESUMIDO') {
      itens.push({
        tipo: 'ECD',
        descricao: `ECD ${ano} (SPED Contabil)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 4, 31), // 31 de maio
        recorrencia: 'anual',
        prioridade: 'critica',
      });
      itens.push({
        tipo: 'ECF',
        descricao: `ECF ${ano} (SPED Fiscal anual)`,
        competencia: String(ano),
        dataVencimento: new Date(ano + 1, 6, 31), // 31 de julho
        recorrencia: 'anual',
        prioridade: 'critica',
      });
    }

    const data = itens.map((it) => ({
      ...it,
      companyId,
      status: 'pendente',
    }));
    await this.prisma.fiscalCalendarItem.createMany({ data });
    return { generated: data.length };
  }

  /**
   * REGERA o calendário de um ano para TODAS as empresas ativas — com as datas
   * corrigidas (FGTS dia 20, DCTFWeb último dia útil, etc). Apaga os itens do ano
   * que ainda NÃO foram pagos/entregues (preserva histórico de comprovantes) e cria
   * de novo. Ideal para aplicar as regras novas em massa.
   */
  /**
   * GARANTE o calendário do ano — gera SÓ para os clientes que ainda não têm nenhuma
   * obrigação do ano. Idempotente e barato: pode rodar no agendador sem apagar nada.
   */
  async garantirAno(ano: number) {
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true } });
    const comItens = new Set(
      (await this.prisma.fiscalCalendarItem.findMany({
        where: { competencia: { startsWith: String(ano) } }, select: { companyId: true }, distinct: ['companyId'],
      })).map((x) => x.companyId),
    );
    let empresas = 0, gerados = 0;
    for (const c of companies) {
      if (comItens.has(c.id)) continue;
      try { const r = await this.gerarAnual(c.id, ano); gerados += r.generated; empresas++; } catch { /* regime inválido — pula */ }
    }
    return { empresas, gerados, ano };
  }

  async regenerarTodos(ano: number) {
    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true },
    });
    let empresas = 0, gerados = 0, apagados = 0;
    for (const c of companies) {
      // apaga só o que está em aberto deste ano (mensais YYYY-MM e anuais YYYY / YYYY-Tn)
      const del = await this.prisma.fiscalCalendarItem.deleteMany({
        where: {
          companyId: c.id,
          competencia: { startsWith: String(ano) },
          status: { notIn: ['paga', 'isenta', 'entregue'] },
        },
      });
      apagados += del.count;
      try {
        const r = await this.gerarAnual(c.id, ano);
        gerados += r.generated;
        empresas++;
      } catch { /* empresa sem regime válido — pula */ }
    }
    return { empresas, gerados, apagadosEmAberto: apagados, ano };
  }

  /** Diariamente: marca obrigações vencidas. Pode ser chamado por cron externo.
   *  FGTS/eSocial são cumpridos no portal do governo (sem PDF na pasta) → não viram
   *  "vencida" por falta de comprovante (seria falha fantasma); ficam fora dessa marcação. */
  async markOverdue() {
    const now = new Date();
    const result = await this.prisma.fiscalCalendarItem.updateMany({
      where: { dataVencimento: { lt: now }, status: { in: ['pendente', 'em_apuracao', 'apurada'] }, tipo: { notIn: ['FGTS', 'ESOCIAL', 'DARF'] } },
      data: { status: 'vencida' },
    });
    // reverte FGTS/eSocial que já estavam marcados vencida → pendente (controle no portal)
    const rev = await this.prisma.fiscalCalendarItem.updateMany({
      where: { tipo: { in: ['FGTS', 'ESOCIAL', 'DARF'] }, status: 'vencida' },
      data: { status: 'pendente' },
    });
    // CORRIGE marcações de FUTURO: obrigação cuja competência ainda NÃO ocorreu não pode estar
    // 'entregue' (o comprovante não existe). Reverte competências mensais > mês atual → pendente.
    const compAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const futEnt = await this.prisma.fiscalCalendarItem.findMany({
      where: { status: 'entregue', competencia: { gte: compAtual } },
      select: { id: true, competencia: true },
    });
    // competência do mês corrente ainda não fechou → recibo não existe → reverte
    const idsFut = futEnt.filter((i) => /^\d{4}-\d{2}$/.test(i.competencia) && i.competencia >= compAtual).map((i) => i.id);
    let futuros = 0;
    if (idsFut.length) { const r = await this.prisma.fiscalCalendarItem.updateMany({ where: { id: { in: idsFut } }, data: { status: 'pendente' } }); futuros = r.count; }
    return { updated: result.count, revertidosPortal: rev.count, futurosRevertidos: futuros };
  }

  // ── RECONCILIAÇÃO POR EVIDÊNCIA ────────────────────────────────────────────
  // Lê os DOCUMENTOS já capturados (comprovantes/recibos nas pastas, ex.: "DAS Maio
  // 2026.pdf") e decide o status REAL de cada obrigação: entregue (achou o comprovante
  // dela na competência), vencida (venceu e não achou) ou pendente (ainda no prazo).
  // Só mexe nos status automáticos — preserva o que o contador marcou (paga/isenta/apuração).

  private static readonly _KW: Record<string, string[]> = {
    DAS: ['pgdasd', 'pgdas', 'das', 'simei', 'simples'],
    'DASN-SIMEI': ['dasnsimei', 'dasn', 'simei'],
    DCTFWeb: ['dctfweb', 'dctfdec', 'dctf', 'mit'],
    DEFIS: ['defis'],
    ECD: ['ecd', 'spedcontabil', 'sped contabil'],
    ECF: ['ecf'],
    EFD_REINF: ['reinf', 'efdreinf'],
    ESOCIAL: ['esocial', 'esoc'],
    FGTS: ['fgts', 'grf', 'grrf'],
    ICMS: ['icms', 'gia', 'gare', 'sped', 'efd'],
    DARF: ['darf', 'pis', 'cofins', 'irpj', 'csll', 'irrf'],
  };
  private static readonly _MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /** normaliza: sem acento, minúsculo, e QUALQUER separador (/ . - _) vira espaço. */
  private static _norm(s: string): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  /** keyword como "palavra" (espaço/dígito conta como borda) — evita "das" em "vendas". */
  private static _temPalavra(nome: string, kw: string): boolean {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(nome);
  }
  /** nome/pasta referencia a competência? (aceita 05 2026, 2026 05, 052026, maio 2026, ...) */
  private static _refCompetencia(nome: string, competencia: string): boolean {
    const [y, m] = competencia.split('-');
    if (!m) return nome.includes(y); // anual → basta o ano
    const yy = y.slice(2);
    const mm = m.padStart(2, '0');
    const mes = FiscalCalendarService._MESES[parseInt(m, 10) - 1] ?? '';
    const pats = [
      `${mm} ${y}`, `${y} ${mm}`,   // 05 2026 · 2026 05 (pastas /2026/05, 05-2026, 05.2026)
      `${mm}${y}`, `${y}${mm}`,      // 052026 · 202605
      `${mm} ${yy}`,                 // 05 26
    ];
    if (pats.some((p) => nome.includes(p))) return true;
    if (mes && nome.includes(mes) && nome.includes(y)) return true; // maio + 2026
    return false;
  }

  /**
   * Reconcilia as obrigações do ano a partir dos documentos entregues nas pastas.
   * Bounded por tempo/empresas p/ caber num ciclo. Idempotente.
   */
  async reconciliarPorDocumentos(opts?: { ano?: number; limitEmpresas?: number; timeBudgetMs?: number }) {
    const ano = opts?.ano ?? new Date().getFullYear();
    const timeBudgetMs = opts?.timeBudgetMs ?? 3 * 60_000;
    const inicio = Date.now();
    const now = new Date();
    const AUTO = ['pendente', 'vencida', 'entregue']; // status geridos automaticamente
    // empresas menos recentemente reconciliadas primeiro (usa updatedAt do item mais antigo)
    const empresas = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true }, take: opts?.limitEmpresas ?? 60,
      orderBy: { updatedAt: 'asc' },
    });

    let empresasProc = 0, entregues = 0, vencidas = 0, pendentes = 0, semMudanca = 0;
    for (const emp of empresas) {
      if (Date.now() - inicio > timeBudgetMs) break;
      const itens = await this.prisma.fiscalCalendarItem.findMany({
        where: { companyId: emp.id, competencia: { startsWith: String(ano) }, status: { in: AUTO } },
        select: { id: true, tipo: true, competencia: true, dataVencimento: true, status: true },
      });
      if (!itens.length) { empresasProc++; continue; }
      const docs = await this.prisma.document.findMany({
        where: { companyId: emp.id, originalFilename: { not: null } },
        select: { originalFilename: true, folderPath: true },
      });
      // usa NOME + PASTA — a competência dos comprovantes costuma estar na pasta (/2026/05)
      const nomes = docs.map((d) => FiscalCalendarService._norm(`${d.originalFilename ?? ''} ${d.folderPath ?? ''}`));

      for (const it of itens) {
        const kws = FiscalCalendarService._KW[it.tipo] ?? [FiscalCalendarService._norm(it.tipo)];
        const achou = nomes.some((n) =>
          kws.some((k) => FiscalCalendarService._temPalavra(n, k)) && FiscalCalendarService._refCompetencia(n, it.competencia),
        );
        const novo = achou ? 'entregue' : (new Date(it.dataVencimento) < now ? 'vencida' : 'pendente');
        if (novo !== it.status) {
          await this.prisma.fiscalCalendarItem.update({ where: { id: it.id }, data: { status: novo } }).catch(() => undefined);
          if (novo === 'entregue') entregues++; else if (novo === 'vencida') vencidas++; else pendentes++;
        } else semMudanca++;
      }
      // "toca" a empresa p/ ela ir pro fim da fila de reconciliação
      await this.prisma.company.update({ where: { id: emp.id }, data: { updatedAt: new Date() } }).catch(() => undefined);
      empresasProc++;
    }
    return { ano, empresasProcessadas: empresasProc, marcadasEntregue: entregues, marcadasVencida: vencidas, marcadasPendente: pendentes, semMudanca };
  }

  /**
   * DIAGNÓSTICO da reconciliação — isola POR QUE uma obrigação não casa. Para cada tipo:
   *  - casaExato: achou comprovante do tipo NA competência (o que vira "entregue")
   *  - temDocTipoNoAno: empresa tem ≥1 doc do tipo no ano (competência errada → problema de MÊS)
   *  - semDocTipo: empresa não tem nenhum doc daquele tipo no ano (problema de DOC AUSENTE)
   * Também reporta cobertura de folderPath nos comprovantes-PDF (gargalo de captura).
   */
  async diagnosticarReconciliacao(ano: number, limitEmpresas = 220) {
    const empresas = await this.prisma.company.findMany({ where: { active: true }, select: { id: true }, take: limitEmpresas });
    const porTipo: Record<string, { itens: number; casaExato: number; temDocTipoNoAno: number; semDocTipo: number }> = {};
    let pdfComprovante = 0, pdfComprovanteSemPasta = 0;
    for (const emp of empresas) {
      const itens = await this.prisma.fiscalCalendarItem.findMany({
        where: { companyId: emp.id, competencia: { startsWith: String(ano) } },
        select: { tipo: true, competencia: true },
      });
      if (!itens.length) continue;
      const docs = await this.prisma.document.findMany({
        where: { companyId: emp.id, originalFilename: { not: null } },
        select: { originalFilename: true, folderPath: true },
      });
      const nomes = docs.map((d) => ({
        n: FiscalCalendarService._norm(`${d.originalFilename ?? ''} ${d.folderPath ?? ''}`),
        temAno: (`${d.originalFilename ?? ''} ${d.folderPath ?? ''}`).includes(String(ano)),
      }));
      // cobertura de folderPath entre comprovantes-PDF (nome com palavra de obrigação)
      for (const d of docs) {
        const fn = (d.originalFilename ?? '').toLowerCase();
        if (fn.endsWith('.pdf') && /pgdas|das|dctf|fgts|reinf|darf|esocial|gia|defis|ecd|ecf|recibo|comprovante/.test(fn)) {
          pdfComprovante++; if (!d.folderPath) pdfComprovanteSemPasta++;
        }
      }
      for (const it of itens) {
        const kws = FiscalCalendarService._KW[it.tipo] ?? [FiscalCalendarService._norm(it.tipo)];
        const temTipo = (extra: (x: { n: string; temAno: boolean }) => boolean) =>
          nomes.some((x) => kws.some((k) => FiscalCalendarService._temPalavra(x.n, k)) && extra(x));
        const bucket = (porTipo[it.tipo] ??= { itens: 0, casaExato: 0, temDocTipoNoAno: 0, semDocTipo: 0 });
        bucket.itens++;
        if (temTipo((x) => FiscalCalendarService._refCompetencia(x.n, it.competencia))) bucket.casaExato++;
        else if (temTipo((x) => x.temAno)) bucket.temDocTipoNoAno++;
        else bucket.semDocTipo++;
      }
    }
    return {
      ano, empresas: empresas.length,
      folderPathComprovantes: { pdfComprovante, semPasta: pdfComprovanteSemPasta, pctComPasta: pdfComprovante ? Math.round((1 - pdfComprovanteSemPasta / pdfComprovante) * 100) : 0 },
      porTipo,
    };
  }
}
