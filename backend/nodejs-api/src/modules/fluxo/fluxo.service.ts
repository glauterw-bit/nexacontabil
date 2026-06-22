import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OneDriveService } from '../cloud/onedrive.service';

export const COLUNAS: Record<string, { key: string; label: string; cor: string }[]> = {
  contabil: [
    { key: 'triagem', label: 'Triagem de documentos', cor: '#64748b' },
    { key: 'fechamento', label: 'Fechamento', cor: '#6366f1' },
    { key: 'conciliacao', label: 'Conciliação', cor: '#3b82f6' },
    { key: 'relatorios', label: 'Relatórios', cor: '#a855f7' },
    { key: 'envio', label: 'Envio (lançamento contábil)', cor: '#10b981' },
  ],
  fiscal: [
    { key: 'triagem_xml', label: 'Triagem de XMLs', cor: '#64748b' },
    { key: 'fechamento_fiscal', label: 'Fechamento fiscal (apuração)', cor: '#6366f1' },
    { key: 'validacao', label: 'Validação (recibos)', cor: '#f59e0b' },
    { key: 'entrega_obrigacoes', label: 'Entrega de obrigações', cor: '#3b82f6' },
    { key: 'checklist', label: 'Check-list', cor: '#a855f7' },
    { key: 'envio_fiscal', label: 'Envio (apuração + impostos + recibos)', cor: '#10b981' },
  ],
};

// termos que identificam um recibo/comprovante de entrega no drive
const RECIBO_RX = /(recibo|protocolo|comprovante|entrega|declarac|transmiss|\.rec\b)/i;

const MESES_NOME = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Reconhece se o nome do arquivo se refere à competência (YYYY-MM). */
function refereAoMes(nome: string, competencia: string): boolean {
  const [y, m] = competencia.split('-');
  if (!y || !m) return false;
  const yy = y.slice(2);
  const nome3 = MESES_NOME[parseInt(m, 10) - 1];
  const rx = new RegExp(
    `(${m}[\\/\\-\\.]?${y}|${y}[\\/\\-\\.]?${m}|${m}[\\/\\-\\.]?${yy}|${nome3}[a-z]*[\\/\\-\\. ]?${yy}|${nome3}[a-z]*[\\/\\-\\. ]?${y})`,
    'i',
  );
  return rx.test(nome ?? '');
}

@Injectable()
export class FluxoService {
  private readonly logger = new Logger(FluxoService.name);
  constructor(private readonly prisma: PrismaService, private readonly onedrive: OneDriveService) {}

  async board(departamento: string, competencia: string) {
    const dep = departamento === 'contabil' ? 'contabil' : 'fiscal';
    const colunas = COLUNAS[dep];
    const primeira = colunas[0].key;

    const companies = await this.prisma.company.findMany({
      where: { active: true }, select: { id: true, name: true, taxRegime: true, sharepointDocsCount: true },
    });
    const ids = companies.map((c) => c.id);
    const estados = await this.prisma.fluxoEstado.findMany({ where: { departamento: dep, competencia, companyId: { in: ids } } });
    const estadoBy = new Map(estados.map((e) => [e.companyId, e]));
    // docs por empresa (pra posição inicial computada)
    const grouped = await this.prisma.document.groupBy({ by: ['companyId'], _count: { _all: true } });
    const docsBy = new Map(grouped.map((g) => [g.companyId, g._count._all]));

    const cards = companies.map((c) => {
      const est = estadoBy.get(c.id);
      const temDocs = (docsBy.get(c.id) ?? 0) > 0;
      // posição: estado salvo, ou padrão (sem docs fica na triagem)
      const etapa = est?.etapa ?? primeira;
      return {
        companyId: c.id, nome: c.name, regime: c.taxRegime, docs: docsBy.get(c.id) ?? 0,
        etapa, temDocs,
        reciboEncontrado: est?.reciboEncontrado ?? false,
        reciboArquivo: est?.reciboArquivo ?? null,
        reciboCheckedAt: est?.reciboCheckedAt ?? null,
      };
    });

    const board = colunas.map((col) => ({
      ...col,
      cards: cards.filter((c) => c.etapa === col.key),
    }));
    return { departamento: dep, competencia, colunas: board, total: cards.length };
  }

  async mover(companyId: string, departamento: string, competencia: string, etapa: string) {
    const dep = departamento === 'contabil' ? 'contabil' : 'fiscal';
    await this.prisma.fluxoEstado.upsert({
      where: { companyId_departamento_competencia: { companyId, departamento: dep, competencia } },
      create: { companyId, departamento: dep, competencia, etapa },
      update: { etapa },
    });
    return { ok: true, etapa };
  }

  /**
   * Validação AUTOMÁTICA: lê a pasta do cliente no drive e procura o recibo
   * de entrega. Se achar, marca reciboEncontrado=true (validado). Um cliente
   * por chamada (leve). Não derruba o banco.
   */
  async verificarRecibo(companyId: string, competencia: string, departamento = 'fiscal') {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }, select: { sharepointDriveId: true, sharepointItemId: true },
    });
    if (!company?.sharepointDriveId || !company?.sharepointItemId) {
      return { reciboEncontrado: false, motivo: 'cliente sem pasta no drive' };
    }
    const conn = await this.prisma.cloudConnection.findFirst({
      where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' },
    });
    if (!conn) return { reciboEncontrado: false, motivo: 'sem conexão OneDrive' };

    let encontrado = false; let arquivo: string | null = null;
    try {
      // junta os arquivos de recibo da pasta raiz + subpastas (Recibos/Obrigações/...)
      const itens = await this.onedrive.search(conn.id, { folderId: company.sharepointItemId, driveId: company.sharepointDriveId, pageSize: 200 });
      const candidatos: any[] = (itens ?? []).filter((i: any) => !i.isFolder && RECIBO_RX.test(i.name ?? ''));
      const subs = (itens ?? []).filter((i: any) => i.isFolder && /(recibo|obrigac|comprovante|protocolo|entrega|fiscal|acessor)/i.test(i.name ?? '')).slice(0, 3);
      for (const sub of subs) {
        const filhos = await this.onedrive.search(conn.id, { folderId: sub.id, driveId: company.sharepointDriveId, pageSize: 200 });
        candidatos.push(...(filhos ?? []).filter((f: any) => !f.isFolder && RECIBO_RX.test(f.name ?? '')));
      }
      // prioriza o recibo DO MÊS (nome cita a competência); senão, marca como genérico
      const doMes = candidatos.find((c) => refereAoMes(c.name ?? '', competencia));
      if (doMes) { encontrado = true; arquivo = doMes.name; }
      else if (candidatos.length) { encontrado = true; arquivo = `(genérico) ${candidatos[0].name}`; }
    } catch (e: any) {
      this.logger.warn(`verificarRecibo ${companyId}: ${e?.message ?? e}`);
      return { reciboEncontrado: false, motivo: 'erro ao ler o drive' };
    }

    const dep = departamento === 'contabil' ? 'contabil' : 'fiscal';
    await this.prisma.fluxoEstado.upsert({
      where: { companyId_departamento_competencia: { companyId, departamento: dep, competencia } },
      create: { companyId, departamento: dep, competencia, etapa: encontrado ? 'envio_fiscal' : 'validacao', reciboEncontrado: encontrado, reciboArquivo: arquivo, reciboCheckedAt: new Date() },
      update: { reciboEncontrado: encontrado, reciboArquivo: arquivo, reciboCheckedAt: new Date(), ...(encontrado ? { etapa: 'envio_fiscal' } : {}) },
    });
    return { reciboEncontrado: encontrado, arquivo };
  }

  /**
   * Verifica recibos dos clientes AINDA NÃO verificados nessa competência.
   * Lote pequeno (sequencial) — chamar em loop até `restantes` zerar.
   */
  async verificarRecibosLote(competencia: string, limit = 5) {
    const checados = new Set(
      (await this.prisma.fluxoEstado.findMany({
        where: { departamento: 'fiscal', competencia, reciboCheckedAt: { not: null } },
        select: { companyId: true },
      })).map((e) => e.companyId),
    );
    const companies = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } }, select: { id: true }, orderBy: { name: 'asc' },
    });
    const pendentes = companies.filter((c) => !checados.has(c.id));
    const lote = pendentes.slice(0, limit);
    let achados = 0;
    for (const c of lote) {
      const r = await this.verificarRecibo(c.id, competencia, 'fiscal');
      if (r.reciboEncontrado) achados++;
    }
    return { verificados: lote.length, recibosEncontrados: achados, restantes: pendentes.length - lote.length };
  }

  /** Meses (competências) com documentos — pra apurar retroativo. */
  async competencias() {
    const docs = await this.prisma.document.findMany({ where: { issueDate: { not: null } }, select: { issueDate: true } });
    const m = new Map<string, number>();
    for (const d of docs) {
      const c = new Date(d.issueDate as Date).toISOString().slice(0, 7);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([competencia, docs]) => ({ competencia, docs }))
      .sort((a, b) => b.competencia.localeCompare(a.competencia));
  }
}
