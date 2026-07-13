import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BuscaDocsService } from '../busca-docs/busca-docs.service';
import { AiService } from '../ai/ai.service';

/**
 * CONSULTOR DE DOCUMENTOS (IA) — o gestor/analista pede um documento em linguagem
 * natural ("me traz a última nota da Clínica Owen", "notas da Mafer com imposto errado")
 * e recebe: (1) os documentos encontrados e (2) uma ANÁLISE fiscal/contábil pronta.
 *
 * Compõe o que já existe: BuscaDocsService (acha por NL, já casa cliente + inconsistências)
 * + AiService (redige a análise). Sem duplicar lógica.
 */
@Injectable()
export class ConsultorService {
  private readonly logger = new Logger('Consultor');

  constructor(
    private readonly prisma: PrismaService,
    private readonly busca: BuscaDocsService,
    private readonly ai: AiService,
  ) {}

  async perguntar(pergunta: string, historico: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
    const q = (pergunta ?? '').trim();
    if (!q) return { resposta: 'Faça uma pergunta — ex.: "última nota da Clínica Owen" ou "como está o fiscal da Mafer?".', documentos: [], resumo: null };

    // 1) ENCONTRA os documentos (linguagem natural → filtros → busca no acervo)
    const achado: any = await this.busca.buscar(q);
    const todosResultados: any[] = achado?.resultados ?? [];

    // 2) FILTRA para documentos FISCAIS REAIS — o acervo tem muitos arquivos de apoio
    //    (PDF, .txt, senhas, requerimentos, certificados) que não são notas e distorcem
    //    a análise. Analisa só o que é nota (nfe/nfse/cte/nfce) ou tem valor/emitente.
    const FISCAIS = new Set(['nfe', 'nfse', 'cte', 'nfce', 'nf-e']);
    const ehFiscal = (d: any) => FISCAIS.has((d.tipo ?? '').toLowerCase()) || d.valor != null || !!d.emitente;
    const docs: any[] = todosResultados.filter(ehFiscal);
    const arquivosApoio = todosResultados.length - docs.length;

    // 2) monta um resumo enxuto do que foi achado p/ alimentar a análise
    const topo = docs.slice(0, 15).map((d) => ({
      cliente: d.cliente, tipo: d.tipo, numero: d.numero, emitente: d.emitente,
      valor: d.valor, data: d.data ? new Date(d.data).toLocaleDateString('pt-BR') : null,
      ncms: d.ncms, impostos: d.impostos,
      inconsistencias: (d.inconsistencias ?? []).slice(0, 4),
    }));
    const totInc = docs.reduce((s, d) => s + ((d.inconsistencias ?? []).length ? 1 : 0), 0);
    const valorFiscal = docs.reduce((s, d) => s + (d.valor ?? 0), 0);

    const resumo = {
      encontrados: docs.length,          // só documentos fiscais
      totalDisponivel: achado?.totalDisponivel ?? docs.length,
      arquivosApoio,                     // PDFs/recibos ignorados na análise
      valorTotal: Math.round(valorFiscal * 100) / 100,
      comInconsistencia: totInc,
      clientes: achado?.clientesEncontrados ?? [],
      clienteNaoEncontrado: !!achado?.clienteNaoEncontrado,
    };

    // 3) CONTEXTO RICO da empresa (regime, faturamento, entradas, obrigações) — deixa a
    //    IA raciocinar com dados reais, não só a amostra de documentos.
    const empresaCtx = await this._contextoEmpresa(resumo.clientes ?? []);

    const systemPrompt =
      `Você é um CONSULTOR FISCAL e CONTÁBIL SÊNIOR brasileiro, especialista em Simples Nacional, ` +
      `Lucro Presumido/Real, NF-e, NFS-e, ISS, ICMS, PIS/COFINS (inclusive monofásico), SPED e obrigações ` +
      `acessórias. Fala com um gestor de contabilidade. Regras: use APENAS os dados reais fornecidos (nunca ` +
      `invente números, CNPJ, datas ou valores); seja objetivo e acionável; responda em bullets curtos; sempre ` +
      `cite valores/percentuais quando existirem e termine com o PRÓXIMO PASSO. Marque risco fiscal com 🚨 e ` +
      `situação regular com ✅. Se faltar dado para concluir, diga o que precisa em vez de supor.`;

    // 3a) SEM documentos fiscais: ainda assim responde de forma inteligente (pergunta
    //     geral de tributação, ou cliente encontrado mas sem notas no período).
    if (!docs.length) {
      if (resumo.clienteNaoEncontrado) {
        return { resposta: `Não encontrei um cliente com esse nome. Confira a grafia, ou tente pelo código/CNPJ.`, documentos: [], resumo: { ...resumo, arquivosApoio } };
      }
      const ctx = empresaCtx ? `\n\nDADOS DO CLIENTE:\n${empresaCtx}` : '';
      const obs = arquivosApoio > 0 ? `\n(Observação: há ${arquivosApoio} arquivo(s) de apoio na pasta, mas nenhuma nota fiscal com dados no período.)` : '';
      const resposta = await this.ai.chatInteligente(`${q}${ctx}${obs}`, historico, { system: systemPrompt });
      return { resposta, documentos: [], resumo: { ...resumo, arquivosApoio } };
    }

    // 3b) COM documentos: análise fiscal fundamentada nos docs + no perfil do cliente
    const contexto =
      `PERGUNTA DO USUÁRIO: "${q}"\n\n` +
      (empresaCtx ? `PERFIL DO CLIENTE:\n${empresaCtx}\n\n` : '') +
      `DOCUMENTOS ENCONTRADOS: ${resumo.encontrados} (de ${resumo.totalDisponivel} no acervo) · ` +
      `valor somado R$ ${Number(resumo.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · ` +
      `${resumo.comInconsistencia} com inconsistência fiscal detectada\n` +
      `AMOSTRA (até 15):\n${JSON.stringify(topo, null, 1)}`;

    let resposta: string;
    try {
      resposta = await this.ai.chatInteligente(contexto, historico, { system: systemPrompt, maxTokens: 3072 });
    } catch (e: any) {
      this.logger.warn(`IA indisponível: ${e?.message ?? e}`);
      resposta = this._analiseSemIA(resumo, topo);
    }

    return { resposta, documentos: docs.slice(0, 30), resumo };
  }

  /** Reúne perfil + números reais do cliente (1ª empresa casada) para a IA raciocinar. */
  private async _contextoEmpresa(nomes: string[]): Promise<string | null> {
    if (!nomes?.length) return null;
    const comp = await this.prisma.company.findFirst({
      where: { name: nomes[0] },
      select: { id: true, name: true, cnpj: true, taxRegime: true, segmentoFiscal: true, uf: true },
    });
    if (!comp) return null;
    const ano = new Date().getFullYear();
    const cnpj = (comp.cnpj ?? '').replace(/\D/g, '');
    const ini = new Date(ano, 0, 1);
    const [emit, receb, obrig] = await Promise.all([
      this.prisma.document.aggregate({ where: { companyId: comp.id, issuerCnpj: cnpj, issueDate: { gte: ini } }, _sum: { totalValue: true }, _count: { id: true } }),
      this.prisma.document.aggregate({ where: { companyId: comp.id, recipientCnpj: cnpj, issueDate: { gte: ini } }, _sum: { totalValue: true }, _count: { id: true } }),
      this.prisma.fiscalCalendarItem.groupBy({ by: ['status'], where: { companyId: comp.id, competencia: { startsWith: String(ano) } }, _count: { id: true } }),
    ]);
    const om: Record<string, number> = {};
    for (const o of obrig) om[o.status] = o._count.id;
    const entregues = ['entregue', 'paga', 'apurada', 'isenta'].reduce((s, k) => s + (om[k] ?? 0), 0);
    const pendentes = (om['pendente'] ?? 0) + (om['em_apuracao'] ?? 0);
    const vencidas = om['vencida'] ?? 0;
    const fmt = (v?: number | null) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    return [
      `Nome: ${comp.name} · CNPJ: ${comp.cnpj ?? '—'} · Regime: ${comp.taxRegime} · UF: ${comp.uf ?? '—'} · Segmento: ${comp.segmentoFiscal ?? '—'}`,
      `Faturamento ${ano} (notas emitidas): ${fmt(emit._sum.totalValue)} em ${emit._count.id} nota(s)`,
      `Entradas ${ano} (notas recebidas): ${fmt(receb._sum.totalValue)} em ${receb._count.id} nota(s)`,
      `Obrigações ${ano}: ${entregues} entregues · ${pendentes} pendentes · ${vencidas} vencidas`,
    ].join('\n');
  }

  /** Fallback determinístico quando a IA não está configurada/disponível. */
  private _analiseSemIA(resumo: any, topo: any[]): string {
    const linhas: string[] = [];
    linhas.push(`Encontrei ${resumo.encontrados} documento(s)${resumo.clientes?.length ? ` de ${resumo.clientes.join(', ')}` : ''}, somando R$ ${Number(resumo.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
    if (resumo.comInconsistencia > 0) {
      linhas.push(`⚠️ ${resumo.comInconsistencia} com inconsistência fiscal — priorize a revisão desses.`);
      const ex = topo.find((d) => d.inconsistencias?.length);
      if (ex) linhas.push(`Ex.: ${ex.cliente ?? ''} nº ${ex.numero ?? '—'}: ${ex.inconsistencias[0]}`);
    } else {
      linhas.push('✅ Sem inconsistências fiscais detectadas no que foi encontrado.');
    }
    return linhas.join('\n');
  }
}
