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
      const itens = await this.onedrive.search(conn.id, { folderId: company.sharepointItemId, driveId: company.sharepointDriveId, pageSize: 200 });
      const match = (itens ?? []).find((i: any) => !i.isFolder && RECIBO_RX.test(i.name ?? ''));
      if (match) { encontrado = true; arquivo = match.name; }
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

  /** Verifica recibos de um LOTE pequeno (clientes na validação). Seguro. */
  async verificarRecibosLote(competencia: string, limit = 8) {
    const companies = await this.prisma.company.findMany({
      where: { active: true, sharepointItemId: { not: null } }, select: { id: true }, take: limit,
    });
    let achados = 0;
    for (const c of companies) {
      const r = await this.verificarRecibo(c.id, competencia, 'fiscal');
      if (r.reciboEncontrado) achados++;
    }
    return { verificados: companies.length, recibosEncontrados: achados };
  }
}
