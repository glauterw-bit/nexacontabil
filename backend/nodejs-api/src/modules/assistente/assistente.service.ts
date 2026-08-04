import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../database/prisma.service';
import { OneDriveService } from '../cloud/onedrive.service';
import { norm, extractComp, MESES_PT } from '../../common/fiscal.util';

/**
 * ASSISTENTE do analista — chat que LOCALIZA documentos do acervo (154k docs + links de
 * comprovante) e ANALISA com IA sob demanda ("acha o DAS de março da Clínica Owen e analisa").
 * Escopo: analista só enxerga a própria carteira (mesma regra dos painéis).
 */
@Injectable()
export class AssistenteAnaliseService {
  private readonly logger = new Logger(AssistenteAnaliseService.name);
  // análise documental sob demanda (volume baixo) merece o modelo forte; override por env
  private readonly model = process.env.ANTHROPIC_MODEL_ANALISE || 'claude-opus-4-8';
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

  constructor(private readonly prisma: PrismaService, private readonly onedrive: OneDriveService) {}

  private readonly TIPOS: Array<{ re: RegExp; tipo: string; docRe: RegExp }> = [
    { re: /\bdas\b|pgdas|simples nacional|pgmei/, tipo: 'DAS', docRe: /pgdas|(^|[^a-z])das([^a-z]|$)|simples/i },
    { re: /dctf/, tipo: 'DCTFWeb', docRe: /dctf/i },
    { re: /reinf/, tipo: 'EFD_REINF', docRe: /reinf/i },
    { re: /darf/, tipo: 'DARF', docRe: /darf/i },
    { re: /fgts|grf/, tipo: 'FGTS', docRe: /fgts|grf/i },
    { re: /nota fiscal|nfe|nf e|notas|danfe/, tipo: 'NFE', docRe: /nfe|danfe|\.xml/i },
    { re: /extrato/, tipo: 'EXTRATO', docRe: /extrato/i },
    { re: /certid/, tipo: 'CERTIDAO', docRe: /certid|cnd/i },
  ];

  /** Chat: localiza (determinístico) e analisa (IA) quando pedido. */
  async chat(user: { name?: string; role?: string } | undefined, mensagem: string, historico?: Array<{ role: string; content: string }>) {
    const msgN = norm(mensagem);
    const anoAtual = new Date().getFullYear();

    // 1) ESCOPO — analista vê só a própria carteira
    const where: any = { active: true };
    if (user?.role === 'analista' && user?.name) where.responsavel = user.name;
    const carteira = await this.prisma.company.findMany({ where, select: { id: true, name: true, clienteCodigo: true, taxRegime: true } });

    // 2) CLIENTE — por código ("#123", "123 -") ou nome (tokens fortes)
    let cliente = carteira.find((c) => c.clienteCodigo && new RegExp(`(^|[^0-9])${c.clienteCodigo}([^0-9]|$)`).test(mensagem));
    if (!cliente) {
      let melhor = 0;
      for (const c of carteira) {
        const tokens = norm(c.name).split(' ').filter((t) => t.length >= 4);
        const hits = tokens.filter((t) => msgN.includes(t)).length;
        if (hits > melhor || (hits === melhor && hits > 0 && tokens.length < 4)) { if (hits > 0) { melhor = hits; cliente = c; } }
      }
    }

    // 3) TIPO + COMPETÊNCIA
    const tipoDef = this.TIPOS.find((t) => t.re.test(msgN));
    let comp = extractComp(msgN, [anoAtual, anoAtual - 1, anoAtual - 2]);
    if (!comp) { // mês por extenso sem ano → assume ano corrente
      const mi = MESES_PT.findIndex((m) => msgN.includes(m));
      if (mi >= 0) comp = `${anoAtual}-${String(mi + 1).padStart(2, '0')}`;
    }

    // 4) LOCALIZA documentos
    let docs: any[] = [];
    let abrirLink: string | null = null;
    if (cliente) {
      const clauses: any = { companyId: cliente.id };
      const rows = await this.prisma.document.findMany({
        where: clauses,
        select: { id: true, originalFilename: true, folderPath: true, type: true, totalValue: true, issueDate: true, fileUrl: true },
        orderBy: { issueDate: 'desc' }, take: 400,
      });
      docs = rows.filter((d) => {
        const hay = `${d.originalFilename ?? ''} ${d.folderPath ?? ''}`;
        if (tipoDef && !tipoDef.docRe.test(hay)) return false;
        if (comp) {
          const compDoc = extractComp(norm(hay), [anoAtual, anoAtual - 1, anoAtual - 2]);
          if (compDoc && compDoc !== comp) return false;
          if (!compDoc && comp) return false;
        }
        return true;
      }).slice(0, 6);
      // link "abrir" do comprovante da obrigação (quando tipo+comp casam)
      if (tipoDef && comp) {
        const ob = await this.prisma.fiscalCalendarItem.findFirst({ where: { companyId: cliente.id, tipo: tipoDef.tipo, competencia: comp, comprovanteUrl: { not: null } }, select: { comprovanteUrl: true } });
        abrirLink = ob?.comprovanteUrl ?? null;
      }
    }

    // 5) ANÁLISE por IA quando pedida (ou pergunta livre sobre o doc)
    const querAnalise = /analis|resum|confer|verific|explic|valid|avali|entend|\ble\b|leia|interpret|confere/.test(msgN);
    let analise: string | null = null;
    if (querAnalise && docs.length && docs[0].fileUrl?.includes('|')) {
      analise = await this.analisarDocumento(docs[0], cliente!, mensagem);
    } else if (querAnalise && !docs.length && abrirLink) {
      // acervo não indexou, mas a obrigação TEM o comprovante — resolve o webUrl e analisa direto
      analise = await this.analisarPorWebUrl(abrirLink, cliente!, mensagem);
    }

    // 6) RESPOSTA
    const partes: string[] = [];
    if (!cliente) {
      partes.push(user?.role === 'analista'
        ? 'Não identifiquei o cliente na sua carteira — me diga o nome ou o código (ex.: "DAS de março da Clínica Owen" ou "#113").'
        : 'Não identifiquei o cliente — me diga o nome ou o código.');
    } else {
      const filtros = [tipoDef?.tipo, comp ? `competência ${comp}` : null].filter(Boolean).join(' · ');
      if (docs.length) partes.push(`Encontrei ${docs.length} documento(s) de **${cliente.name}**${filtros ? ` (${filtros})` : ''}:`);
      else if (abrirLink && analise) partes.push(`Analisei o comprovante de ${tipoDef?.tipo} ${comp} de **${cliente.name}** (link no card):`);
      else if (abrirLink) partes.push(`A obrigação ${tipoDef?.tipo} ${comp} de **${cliente.name}** tem comprovante registrado — link no card abaixo.`);
      else partes.push(`Não achei documentos de **${cliente.name}**${filtros ? ` com ${filtros}` : ''} no acervo. Pode estar só no OneDrive (use o Explorador) ou ainda não subiu.`);
    }
    if (analise) partes.push(`\n**Análise (IA):**\n${analise}`);
    else if (querAnalise && cliente && !docs.length) partes.push('Para eu analisar, preciso localizar o documento primeiro.');

    return {
      resposta: partes.join('\n'),
      cliente: cliente ? { id: cliente.id, nome: cliente.name, codigo: cliente.clienteCodigo } : null,
      docs: docs.map((d) => ({ id: d.id, nome: d.originalFilename, pasta: d.folderPath, tipo: d.type, valor: d.totalValue, data: d.issueDate })),
      abrir: abrirLink,
      analisou: !!analise,
    };
  }

  /** Analisa um documento específico por id (botão "Analisar" no card). */
  async analisarPorId(user: { name?: string; role?: string } | undefined, docId: string, pergunta?: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId }, select: { id: true, companyId: true, originalFilename: true, folderPath: true, type: true, totalValue: true, issueDate: true, fileUrl: true } });
    if (!doc) return { erro: 'documento não encontrado' };
    const company = await this.prisma.company.findUnique({ where: { id: doc.companyId }, select: { id: true, name: true, clienteCodigo: true, taxRegime: true, responsavel: true } });
    if (user?.role === 'analista' && company?.responsavel !== user?.name) return { erro: 'documento fora da sua carteira' };
    const analise = await this.analisarDocumento(doc, company, pergunta || 'Analise este documento.');
    return { doc: { id: doc.id, nome: doc.originalFilename }, analise };
  }

  /** Analisa o COMPROVANTE registrado na obrigação (webUrl → item via Graph shares → conteúdo). */
  private async analisarPorWebUrl(webUrl: string, cliente: any, pergunta: string): Promise<string> {
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    if (!conn) return 'Sem conexão OneDrive para baixar o comprovante.';
    try {
      const item = await this.onedrive.itemPorWebUrl(conn.id, webUrl);
      if (!item) return 'Achei o link do comprovante, mas não consegui resolver o arquivo — abra pelo link do card.';
      return this.analisarDocumento({ originalFilename: item.nome, folderPath: null, totalValue: null, fileUrl: `${item.driveId}|${item.itemId}` }, cliente, pergunta);
    } catch (e: any) {
      return `Não consegui baixar o comprovante (${e?.message ?? 'erro'}). Abra pelo link do card.`;
    }
  }

  /** Baixa o conteúdo (PDF→texto, XML→bruto) e pede a análise ao Claude. */
  private async analisarDocumento(doc: any, cliente: any, pergunta: string): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) return 'IA não configurada (ANTHROPIC_API_KEY).';
    const conn = await this.prisma.cloudConnection.findFirst({ where: { provider: 'microsoft_onedrive', active: true }, orderBy: { createdAt: 'desc' } });
    let conteudo = '';
    const [driveId, fileId] = String(doc.fileUrl ?? '').split('|');
    try {
      if (conn && driveId && fileId && driveId !== 'sefaz' && driveId !== 'sieg') {
        if (/\.xml$/i.test(doc.originalFilename ?? '')) {
          const { buffer } = await this.onedrive.downloadFile(conn.id, fileId, driveId);
          conteudo = buffer.toString('utf8').slice(0, 6000);
        } else {
          const r = await this.onedrive.lerTextoPdf(conn.id, driveId, fileId);
          conteudo = r.texto || '';
          if (!conteudo) return 'O PDF parece escaneado (sem texto extraível) — não consigo ler o conteúdo. Abra o arquivo pra conferência visual.';
        }
      } else if (doc.extractedData) {
        conteudo = String(doc.extractedData).slice(0, 6000);
      }
    } catch (e: any) {
      this.logger.warn(`download p/ análise falhou: ${e?.message}`);
    }
    if (!conteudo) return 'Não consegui baixar o conteúdo deste documento agora.';
    try {
      const res = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1200,
        system: 'Você é um analista fiscal sênior de um escritório contábil brasileiro. Analise documentos fiscais (DAS, DCTFWeb, NF-e, recibos, extratos) com precisão: identifique o que é o documento, competência, valores, datas de vencimento, e QUALQUER inconsistência ou ponto de atenção (valor zerado, competência divergente da pasta, atraso, retificação). Responda em português, direto, em tópicos curtos. Nunca invente valores — se um dado não está no texto, diga que não consta.',
        messages: [{
          role: 'user',
          content: `Cliente: ${cliente?.name ?? '?'} (regime ${cliente?.taxRegime ?? '?'})\nArquivo: ${doc.originalFilename}\nPasta: ${doc.folderPath ?? '-'}\nValor extraído no sistema: ${doc.totalValue ?? 'não consta'}\n\nPedido do analista: ${pergunta}\n\nCONTEÚDO DO DOCUMENTO:\n${conteudo}`,
        }],
      });
      const bloco = res.content.find((b: any) => b.type === 'text') as any;
      return bloco?.text ?? 'Sem resposta da IA.';
    } catch (e: any) {
      this.logger.error(`Claude falhou: ${e?.message}`);
      return `A análise falhou (${e?.message ?? 'erro na IA'}). Tente de novo em instantes.`;
    }
  }
}
