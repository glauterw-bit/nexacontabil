import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';

/**
 * VERIFICAÇÃO FINAL — apura, cliente a cliente, se a implantação está completa:
 *   • arquivos carregados (Drive + SEFAZ), com última emissão e docs do ano
 *   • cadastro pronto (UF, pasta no Drive, Delta lido, SEFAZ consultado)
 *   • obrigações do calendário fiscal: entregues × pendentes × vencidas
 * E dispara a análise garantidora (aprender NCM → revalidar acervo → auditoria).
 *
 * "Entregue" = status entregue|paga|apurada|isenta (cumprida); faltante = pendente|
 * em_apuracao ainda no prazo; vencida = passou do prazo sem entrega.
 */
@Injectable()
export class VerificacaoFinalService {
  private readonly logger = new Logger('VerificacaoFinal');

  constructor(
    private readonly prisma: PrismaService,
    private readonly analise: AnaliseClienteService,
    private readonly ncm: NcmInteligenteService,
  ) {}

  private readonly CUMPRIDA = ['entregue', 'paga', 'apurada', 'isenta'];

  /** Relatório completo por cliente (autenticado). */
  async relatorio(ano?: number) {
    const anoRef = ano ?? new Date().getFullYear();
    const ini = new Date(anoRef, 0, 1);

    const clientes = await this.prisma.company.findMany({
      where: { active: true },
      select: {
        id: true, name: true, cnpj: true, uf: true,
        sharepointItemId: true, sharepointDeltaLink: true,
        sefazUltConsultaEm: true, sefazUltNSU: true, sefazMaxNSU: true,
      },
      orderBy: { name: 'asc' },
    });

    // agregados de documentos (1 query por métrica, não por cliente)
    const [docsTotais, docsSefaz, docsAno, ultimaEmissao, obrigacoes] = await Promise.all([
      this.prisma.document.groupBy({ by: ['companyId'], _count: { id: true } }),
      this.prisma.document.groupBy({ by: ['companyId'], where: { fileUrl: { startsWith: 'sefaz|' } }, _count: { id: true } }),
      this.prisma.document.groupBy({ by: ['companyId'], where: { issueDate: { gte: ini } }, _count: { id: true } }),
      this.prisma.document.groupBy({ by: ['companyId'], _max: { issueDate: true } }),
      this.prisma.fiscalCalendarItem.groupBy({
        by: ['companyId', 'status'],
        where: { competencia: { startsWith: String(anoRef) } },
        _count: { id: true },
      }),
    ]);
    const mapa = <T extends { companyId: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.companyId, r]));
    const mTot = mapa(docsTotais); const mSef = mapa(docsSefaz);
    const mAno = mapa(docsAno); const mUlt = mapa(ultimaEmissao);
    const mObr = new Map<string, Record<string, number>>();
    for (const o of obrigacoes) {
      const cur = mObr.get(o.companyId) ?? {};
      cur[o.status] = o._count.id;
      mObr.set(o.companyId, cur);
    }

    const linhas = clientes.map((c) => {
      const total = (mTot.get(c.id) as any)?._count?.id ?? 0;
      const doSefaz = (mSef.get(c.id) as any)?._count?.id ?? 0;
      const doAno = (mAno.get(c.id) as any)?._count?.id ?? 0;
      const ultima = (mUlt.get(c.id) as any)?._max?.issueDate ?? null;
      const obr = mObr.get(c.id) ?? {};
      const entregues = this.CUMPRIDA.reduce((s, k) => s + (obr[k] ?? 0), 0);
      const vencidas = obr['vencida'] ?? 0;
      const faltantes = (obr['pendente'] ?? 0) + (obr['em_apuracao'] ?? 0);
      const totalObr = Object.values(obr).reduce((s, n) => s + n, 0);

      const cnpjNum = (c.cnpj ?? '').replace(/\D/g, '');
      const pend: string[] = [];
      if (!c.sharepointItemId) pend.push('sem pasta no Drive');
      else if (!c.sharepointDeltaLink) pend.push('Delta 1ª volta pendente');
      if (!c.uf) pend.push('sem UF');
      if (!cnpjNum || cnpjNum.startsWith('7')) pend.push('CNPJ provisório');
      else if (c.uf && !c.sefazUltConsultaEm) pend.push('SEFAZ não consultado');
      if (total === 0) pend.push('nenhum documento carregado');
      if (vencidas > 0) pend.push(`${vencidas} obrigação(ões) vencida(s)`);

      return {
        id: c.id, nome: c.name, cnpj: c.cnpj, uf: c.uf,
        docs: { total, doDrive: total - doSefaz, doSefaz, doAno, ultimaEmissao: ultima },
        fontes: {
          pastaDrive: !!c.sharepointItemId,
          deltaLido: !!c.sharepointDeltaLink,
          sefazConsultado: !!c.sefazUltConsultaEm,
          sefazFilaDrenada: !!(c.sefazUltNSU && c.sefazMaxNSU && BigInt(c.sefazUltNSU) >= BigInt(c.sefazMaxNSU)),
        },
        obrigacoes: { total: totalObr, entregues, faltantes, vencidas },
        pendencias: pend,
        ok: pend.length === 0,
      };
    });

    const resumo = {
      ano: anoRef,
      clientes: linhas.length,
      completos: linhas.filter((l) => l.ok).length,
      comPendencia: linhas.filter((l) => !l.ok).length,
      semDocumentos: linhas.filter((l) => l.docs.total === 0).length,
      semUF: linhas.filter((l) => !l.uf).length,
      sefazNaoConsultado: linhas.filter((l) => l.uf && !l.fontes.sefazConsultado).length,
      deltaPendente: linhas.filter((l) => l.fontes.pastaDrive && !l.fontes.deltaLido).length,
      obrigacoes: {
        total: linhas.reduce((s, l) => s + l.obrigacoes.total, 0),
        entregues: linhas.reduce((s, l) => s + l.obrigacoes.entregues, 0),
        faltantes: linhas.reduce((s, l) => s + l.obrigacoes.faltantes, 0),
        vencidas: linhas.reduce((s, l) => s + l.obrigacoes.vencidas, 0),
      },
      docs: {
        total: linhas.reduce((s, l) => s + l.docs.total, 0),
        doSefaz: linhas.reduce((s, l) => s + l.docs.doSefaz, 0),
        doAno: linhas.reduce((s, l) => s + l.docs.doAno, 0),
      },
    };

    return { resumo, clientes: linhas };
  }

  /** Contadores públicos (sem nomes/CNPJs) — p/ acompanhar a conclusão de fora. */
  async resumoPublico(ano?: number) {
    const { resumo } = await this.relatorio(ano);
    return resumo;
  }

  /** Análise garantidora: aprende NCM dos XMLs → revalida o acervo → auditoria. */
  async analiseFinal() {
    const inicio = Date.now();
    const aprendido = await this.ncm.aprenderDeDocumentos().catch((e: any) => ({ erro: e?.message }));
    const revalidado = await this.analise.revalidarDocumentos().catch((e: any) => ({ erro: e?.message }));
    const auditoria = await this.ncm.auditoria().catch((e: any) => ({ erro: e?.message }));
    this.logger.log(`análise final concluída em ${Math.round((Date.now() - inicio) / 1000)}s`);
    return { aprendido, revalidado, auditoria, duracaoS: Math.round((Date.now() - inicio) / 1000) };
  }
}
