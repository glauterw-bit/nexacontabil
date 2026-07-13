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
    const docs: any[] = achado?.resultados ?? [];

    // 2) monta um resumo enxuto do que foi achado p/ alimentar a análise
    const topo = docs.slice(0, 15).map((d) => ({
      cliente: d.cliente, tipo: d.tipo, numero: d.numero, emitente: d.emitente,
      valor: d.valor, data: d.data ? new Date(d.data).toLocaleDateString('pt-BR') : null,
      ncms: d.ncms, impostos: d.impostos,
      inconsistencias: (d.inconsistencias ?? []).slice(0, 4),
    }));
    const totInc = docs.reduce((s, d) => s + ((d.inconsistencias ?? []).length ? 1 : 0), 0);

    const resumo = {
      encontrados: achado?.encontrados ?? docs.length,
      totalDisponivel: achado?.totalDisponivel ?? docs.length,
      valorTotal: achado?.valorTotal ?? 0,
      comInconsistencia: achado?.comInconsistencia ?? totInc,
      clientes: achado?.clientesEncontrados ?? [],
      clienteNaoEncontrado: !!achado?.clienteNaoEncontrado,
    };

    // 3) ANÁLISE — a IA redige um parecer curto e prático sobre o que foi encontrado
    if (!docs.length) {
      const nada = resumo.clienteNaoEncontrado
        ? `Não encontrei um cliente com esse nome. Confira a grafia ou tente o código/CNPJ.`
        : `Não encontrei documentos para "${q}". Tente por cliente, tipo (nota, boleto), mês ou valor.`;
      return { resposta: nada, documentos: [], resumo };
    }

    const contextoDocs =
      `Consulta do usuário: "${q}"\n` +
      `Encontrados: ${resumo.encontrados} de ${resumo.totalDisponivel} · Valor somado: R$ ${Number(resumo.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Com inconsistência: ${resumo.comInconsistencia}\n` +
      `Documentos (amostra):\n${JSON.stringify(topo, null, 1)}`;

    const instrucao =
      `Você é um consultor fiscal/contábil. Analise os documentos abaixo e responda em português, ` +
      `de forma CURTA e prática (bullets), para um gestor de contabilidade. Cubra: (a) o que foi encontrado ` +
      `em uma frase; (b) pontos de atenção fiscais/tributários (inconsistências de imposto/NCM, valores atípicos, ` +
      `datas); (c) uma recomendação objetiva de próximo passo. Não invente dados que não estão nos documentos. ` +
      `Se estiver tudo certo, diga que está regular.\n\n${contextoDocs}`;

    let resposta: string;
    try {
      resposta = await this.ai.chat(instrucao, historico);
    } catch (e: any) {
      this.logger.warn(`IA indisponível: ${e?.message ?? e}`);
      resposta = this._analiseSemIA(resumo, topo);
    }

    return { resposta, documentos: docs.slice(0, 30), resumo };
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
