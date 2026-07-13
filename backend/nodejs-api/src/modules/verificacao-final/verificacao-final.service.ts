import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AnaliseClienteService } from '../analise-cliente/analise-cliente.service';
import { NcmInteligenteService } from '../ncm-inteligente/ncm-inteligente.service';
import { CADASTRO_OFICIAL_2026 } from './cadastro-oficial-2026';

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
        sefazUltCStat: true, sefazUltMotivo: true,
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
      // cStat 593 (ou 594/596) = escritório sem procuração e-CAC daquele cliente
      const faltaProcuracao = ['593', '594', '596'].includes((c.sefazUltCStat ?? ''));
      const sefazOk = ['137', '138'].includes((c.sefazUltCStat ?? ''));
      const pend: string[] = [];
      if (!c.sharepointItemId) pend.push('sem pasta no Drive');
      else if (!c.sharepointDeltaLink) pend.push('Delta 1ª volta pendente');
      if (!c.uf) pend.push('sem UF');
      if (!cnpjNum || cnpjNum.startsWith('7')) pend.push('CNPJ provisório');
      else if (c.uf && !c.sefazUltConsultaEm) pend.push('SEFAZ não consultado');
      if (faltaProcuracao) pend.push('falta procuração e-CAC (SEFAZ)');
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
          sefazOk, faltaProcuracao,
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
      sefazOk: linhas.filter((l) => l.fontes.sefazOk).length,
      faltaProcuracao: linhas.filter((l) => l.fontes.faltaProcuracao).length,
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

  /**
   * Aplica o CADASTRO OFICIAL (planilha de controle 2026) ao sistema — fonte da verdade
   * p/ CNPJ, regime e status Ativa/Inativa. Casa por código Domínio (clienteCodigo) e,
   * na falta, por nome normalizado. Idempotente: reaplicar não muda nada.
   * Quem está no sistema mas NÃO na planilha é só REPORTADO (não desativa sozinho).
   */
  async aplicarCadastroOficial() {
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const regimeMap: Record<string, string> = {
      'Simples Nacional': 'SIMPLES_NACIONAL', 'Lucro Presumido': 'LUCRO_PRESUMIDO', 'Lucro Real': 'LUCRO_REAL', 'MEI': 'MEI',
    };
    const companies = await this.prisma.company.findMany({
      select: { id: true, name: true, cnpj: true, taxRegime: true, active: true, clienteCodigo: true },
    });
    const porCodigo = new Map(companies.filter((c) => c.clienteCodigo).map((c) => [String(c.clienteCodigo), c]));
    const porNome = new Map(companies.map((c) => [norm(c.name), c]));
    const cnpjsEmUso = new Map(companies.map((c) => [(c.cnpj ?? '').replace(/\D/g, ''), c.id]));

    let atualizados = 0, cnpjsCorrigidos = 0, inativados = 0, reativados = 0, regimes = 0, semMatch = 0, conflitos = 0;
    const naoEncontrados: string[] = [];
    for (const row of CADASTRO_OFICIAL_2026) {
      const alvo = porCodigo.get(String(row.codigo)) ?? porNome.get(norm(row.nome)) ??
        // prefixo: pasta às vezes tem o nome truncado
        companies.find((c) => { const a = norm(c.name), b = norm(row.nome); return a.length >= 8 && (b.startsWith(a) || a.startsWith(b)); });
      if (!alvo) { semMatch++; naoEncontrados.push(`${row.codigo} - ${row.nome}`); continue; }

      const data: any = {};
      const cnpjAtual = (alvo.cnpj ?? '').replace(/\D/g, '');
      if (row.cnpj && row.cnpj !== cnpjAtual) {
        const dono = cnpjsEmUso.get(row.cnpj);
        if (dono && dono !== alvo.id) { conflitos++; } else { data.cnpj = row.cnpj; cnpjsCorrigidos++; cnpjsEmUso.set(row.cnpj, alvo.id); }
      }
      const regime = regimeMap[row.regime];
      if (regime && alvo.taxRegime !== regime) { data.taxRegime = regime; regimes++; }
      const ativa = /ativa/i.test(row.status) && !/inativa/i.test(row.status);
      if (alvo.active !== ativa) { data.active = ativa; if (ativa) reativados++; else inativados++; }
      if (!alvo.clienteCodigo && row.codigo) data.clienteCodigo = String(row.codigo);
      if (Object.keys(data).length) {
        try { await this.prisma.company.update({ where: { id: alvo.id }, data }); atualizados++; }
        catch { conflitos++; }
      }
    }
    const nomesPlanilha = new Set(CADASTRO_OFICIAL_2026.map((r) => norm(r.nome)));
    const codigosPlanilha = new Set(CADASTRO_OFICIAL_2026.map((r) => String(r.codigo)));
    const foraDaPlanilha = companies
      .filter((c) => c.active && !nomesPlanilha.has(norm(c.name)) && !(c.clienteCodigo && codigosPlanilha.has(String(c.clienteCodigo))))
      .map((c) => c.name);
    const r = {
      planilha: CADASTRO_OFICIAL_2026.length, atualizados, cnpjsCorrigidos, regimes,
      inativados, reativados, conflitos, semMatch, naoEncontrados: naoEncontrados.slice(0, 30),
      foraDaPlanilha: foraDaPlanilha.slice(0, 60), foraDaPlanilhaTotal: foraDaPlanilha.length,
    };
    this.logger.log(`cadastro oficial: ${cnpjsCorrigidos} CNPJs, ${regimes} regimes, ${inativados} inativados, ${semMatch} sem match, ${foraDaPlanilha.length} fora da planilha`);
    return r;
  }

  /** Texto pronto para pedir a procuração e-CAC ao cliente (WhatsApp/e-mail). */
  async textoProcuracao() {
    const esc = await this.prisma.certificadoDigital.findFirst({ where: { escritorio: true, active: true }, select: { cnpjCpf: true, nome: true } });
    const cnpj = (esc?.cnpjCpf ?? '').replace(/\D/g, '');
    const cnpjFmt = cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : (esc?.cnpjCpf ?? '—');
    const texto =
      `Olá! Para automatizarmos a captura das suas notas fiscais direto na Receita ` +
      `(sem você precisar enviar nada), pedimos uma *procuração eletrônica* rápida no e-CAC:\n\n` +
      `1) Acesse *gov.br/receitafederal* → e-CAC (login gov.br)\n` +
      `2) Menu *Senhas e Procurações* → *Procuração eletrônica* → *Cadastrar procuração*\n` +
      `3) CNPJ do procurador: *${cnpjFmt}* (nosso escritório)\n` +
      `4) Marque o serviço *"NFe Distribuição de DF-e (NFe-DistDFe)"*\n` +
      `5) Defina a validade (sugerimos 5 anos) e confirme\n\n` +
      `Pronto! A partir daí cuidamos de tudo automaticamente. Qualquer dúvida, estamos à disposição.`;
    return { procuradorCnpj: cnpjFmt, escritorio: esc?.nome ?? null, texto };
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
