import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DocumentoExtraido {
  tipo: 'nfe' | 'nfse' | 'boleto' | 'extrato' | 'recibo' | 'contrato' | 'outro';
  numero?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  valorTotal?: number;
  emitenteCnpj?: string;
  emitenteNome?: string;
  destinatarioCnpj?: string;
  destinatarioNome?: string;
  descricao?: string;
  itens?: Array<{ descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }>;
  impostos?: { icms?: number; iss?: number; pis?: number; cofins?: number; ir?: number; csll?: number };
  chaveAcesso?: string;
  confidence: number;
  sugestoesContabeis?: string[];
  raw?: string;
}

export interface ReconciliacaoMatch {
  sourceId: string;
  targetId: string;
  score: number;
  motivo: string;
}

export interface ReconciliacaoResult {
  matches: ReconciliacaoMatch[];
  unmatchedSources: string[];
  unmatchedTargets: string[];
  totalMatchedValue: number;
  totalUnmatchedValue: number;
  observacoes: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;
  private readonly model = 'claude-sonnet-4-6';

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });
  }

  private get hasKey(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY);
  }

  // ─── OCR e Extração de Documento (com Vision) ─────────────────────────────

  async processarDocumento(
    base64Content: string,
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' = 'image/jpeg',
  ): Promise<DocumentoExtraido> {
    if (!this.hasKey) return this._stubDocumento();

    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as any, data: base64Content },
            },
            {
              type: 'text',
              text: `Você é um especialista em documentos fiscais brasileiros. Analise esta imagem e extraia todos os dados relevantes.

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "tipo": "nfe|nfse|boleto|extrato|recibo|contrato|outro",
  "numero": "número do documento",
  "dataEmissao": "DD/MM/AAAA",
  "dataVencimento": "DD/MM/AAAA ou null",
  "valorTotal": número,
  "emitenteCnpj": "CNPJ sem máscara",
  "emitenteNome": "nome do emitente",
  "destinatarioCnpj": "CNPJ sem máscara ou null",
  "destinatarioNome": "nome do destinatário",
  "descricao": "descrição do produto/serviço",
  "chaveAcesso": "44 dígitos ou null",
  "impostos": {
    "icms": valor ou null,
    "iss": valor ou null,
    "pis": valor ou null,
    "cofins": valor ou null
  },
  "itens": [{"descricao": "", "quantidade": 0, "valorUnitario": 0, "valorTotal": 0}],
  "confidence": 0.0 a 1.0,
  "sugestoesContabeis": ["lançamento sugerido 1", "lançamento sugerido 2"]
}

Extraia com máxima precisão. Se um campo não for visível, use null.`,
            },
          ],
        }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this._stubDocumento();
      return JSON.parse(jsonMatch[0]) as DocumentoExtraido;
    } catch (err: any) {
      this.logger.error(`Erro ao processar documento com Claude: ${err.message}`);
      return this._stubDocumento();
    }
  }

  // ─── Extração de Texto de XML Fiscal ──────────────────────────────────────

  async analisarXmlFiscal(xmlContent: string): Promise<DocumentoExtraido> {
    if (!this.hasKey) return this._stubDocumento();

    try {
      const xmlPreview = xmlContent.slice(0, 8000); // Claude tem limite de contexto
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Você é especialista em XML fiscal brasileiro (NF-e, NFS-e, CT-e). Analise este XML e extraia os dados.

XML:
\`\`\`xml
${xmlPreview}
\`\`\`

Retorne APENAS um JSON válido com esta estrutura:
{
  "tipo": "nfe|nfse|cte|outro",
  "numero": "número da nota",
  "dataEmissao": "DD/MM/AAAA",
  "dataVencimento": null,
  "valorTotal": número,
  "emitenteCnpj": "CNPJ sem máscara",
  "emitenteNome": "nome",
  "destinatarioCnpj": "CNPJ ou null",
  "destinatarioNome": "nome",
  "descricao": "descrição",
  "chaveAcesso": "chave de 44 dígitos ou null",
  "impostos": { "icms": null, "iss": null, "pis": null, "cofins": null },
  "itens": [],
  "confidence": 0.95,
  "sugestoesContabeis": ["Débito: Estoque / Crédito: Fornecedores - R$ X"]
}`,
        }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this._stubDocumento();
      return JSON.parse(jsonMatch[0]) as DocumentoExtraido;
    } catch (err: any) {
      this.logger.error(`Erro ao analisar XML com Claude: ${err.message}`);
      return this._stubDocumento();
    }
  }

  // ─── Reconciliação Automática ─────────────────────────────────────────────

  async reconciliarTransacoes(
    sources: Array<{ id: string; descricao: string; valor: number; data: string }>,
    targets: Array<{ id: string; descricao: string; valor: number; data: string }>,
    matchType: string = 'automatico',
  ): Promise<ReconciliacaoResult> {
    if (!this.hasKey) return this._stubReconciliacao(sources, targets);

    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Você é especialista em conciliação contábil bancária. Faça o matching entre documentos fiscais e lançamentos bancários.

Tipo de reconciliação: ${matchType}

FONTES (documentos fiscais):
${JSON.stringify(sources, null, 2)}

ALVOS (lançamentos bancários):
${JSON.stringify(targets, null, 2)}

Regras de matching:
1. Valores iguais ou com diferença < 1% têm prioridade
2. Datas próximas (±7 dias) aumentam a confiança
3. Palavras-chave na descrição são usadas como desempate
4. Um source pode ter apenas um target e vice-versa

Retorne APENAS um JSON válido:
{
  "matches": [{"sourceId": "id", "targetId": "id", "score": 0.0-1.0, "motivo": "explicação"}],
  "unmatchedSources": ["id"],
  "unmatchedTargets": ["id"],
  "totalMatchedValue": número,
  "totalUnmatchedValue": número,
  "observacoes": "resumo da conciliação"
}`,
        }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this._stubReconciliacao(sources, targets);
      return JSON.parse(jsonMatch[0]) as ReconciliacaoResult;
    } catch (err: any) {
      this.logger.error(`Erro na reconciliação com Claude: ${err.message}`);
      return this._stubReconciliacao(sources, targets);
    }
  }

  // ─── Análise de Planejamento Tributário ───────────────────────────────────

  async analisarPlanejamentoTributario(dados: {
    cnpj: string;
    faturamentoAnual: number;
    setorAtividade: string;
    regimeAtual: string;
    folhaPagamento: number;
    custosOperacionais: number;
  }): Promise<{
    melhorRegime: string;
    economiaEstimada: number;
    comparativo: Array<{ regime: string; impostoEstimado: number; aliquotaEfetiva: number }>;
    recomendacoes: string[];
    alertas: string[];
  }> {
    if (!this.hasKey) {
      return {
        melhorRegime: dados.regimeAtual,
        economiaEstimada: 0,
        comparativo: [],
        recomendacoes: ['Configure ANTHROPIC_API_KEY para análise completa'],
        alertas: [],
      };
    }

    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Você é um especialista em planejamento tributário brasileiro. Analise o caso e recomende o melhor regime.

Dados da empresa:
- CNPJ: ${dados.cnpj}
- Faturamento anual estimado: R$ ${dados.faturamentoAnual.toLocaleString('pt-BR')}
- Setor/Atividade: ${dados.setorAtividade}
- Regime atual: ${dados.regimeAtual}
- Folha de pagamento mensal: R$ ${dados.folhaPagamento.toLocaleString('pt-BR')}
- Custos operacionais mensais: R$ ${dados.custosOperacionais.toLocaleString('pt-BR')}

Compare: Simples Nacional, Lucro Presumido, Lucro Real.
Considere: alíquotas efetivas IRPJ/CSLL/PIS/COFINS/ISS/ICMS, tetos e limitações legais.

Retorne APENAS um JSON válido:
{
  "melhorRegime": "nome do regime",
  "economiaEstimada": número anual em reais,
  "comparativo": [
    {"regime": "Simples Nacional", "impostoEstimado": número anual, "aliquotaEfetiva": percentual},
    {"regime": "Lucro Presumido", "impostoEstimado": número anual, "aliquotaEfetiva": percentual},
    {"regime": "Lucro Real", "impostoEstimado": número anual, "aliquotaEfetiva": percentual}
  ],
  "recomendacoes": ["recomendação 1", "recomendação 2"],
  "alertas": ["alerta sobre limitações ou riscos"]
}`,
        }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON inválido');
      return JSON.parse(jsonMatch[0]);
    } catch (err: any) {
      this.logger.error(`Erro na análise tributária: ${err.message}`);
      return {
        melhorRegime: dados.regimeAtual,
        economiaEstimada: 0,
        comparativo: [],
        recomendacoes: ['Erro na análise — tente novamente'],
        alertas: [err.message],
      };
    }
  }

  // ─── Busca natural: NL → filtros SQL Prisma ──────────────────────────────

  /**
   * Recebe uma query em linguagem natural ("imposto de 2023 da empresa Padaria")
   * e retorna um objeto de filtros estruturados que o backend usa para montar
   * a query Prisma em `documents`. Fallback: busca livre por palavras-chave.
   */
  async parseDocumentSearch(query: string): Promise<{
    type?: string[];                 // ['nfe','nfse','das','darf','boleto','extrato','recibo']
    year?: number;                   // 2023
    monthStart?: number;             // 1-12
    monthEnd?: number;
    issuerKeyword?: string;          // parte do nome/CNPJ do emissor
    cnpj?: string;                   // 14 digitos sem mascara
    minValue?: number;
    maxValue?: number;
    keywords?: string[];             // fallback texto livre
  }> {
    if (!this.hasKey) {
      // sem IA: heurística simples para amanhã ainda funcionar minimamente
      const lower = query.toLowerCase();
      const yearMatch = lower.match(/20\d{2}/);
      const types: string[] = [];
      if (/(imposto|tribut|darf|das|gps|fgts)/.test(lower)) types.push('das','darf','boleto');
      if (/(nf-?e|nota\s*fiscal)/.test(lower)) types.push('nfe','nfse');
      if (/(boleto|cobran)/.test(lower)) types.push('boleto');
      if (/(holerite|folha)/.test(lower)) types.push('holerite');
      if (/(extrato|banco)/.test(lower)) types.push('extrato');
      return {
        type: types.length ? types : undefined,
        year: yearMatch ? Number(yearMatch[0]) : undefined,
        keywords: lower.split(/\s+/).filter((w) => w.length > 3),
      };
    }

    try {
      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Voce e um parser que transforma buscas em linguagem natural sobre documentos contabeis brasileiros em filtros JSON.

Query do usuario: "${query}"

Tipos disponiveis: nfe, nfse, cte, boleto, extrato, recibo, contrato, das, darf, holerite, outro

Responda APENAS com um JSON valido com esta estrutura (campos opcionais):
{
  "type": ["..."],
  "year": 2023,
  "monthStart": 1,
  "monthEnd": 3,
  "issuerKeyword": "nome ou parte",
  "cnpj": "14 digitos sem mascara",
  "minValue": 100.0,
  "maxValue": 5000.0,
  "keywords": ["palavra1","palavra2"]
}

Regras:
- "imposto" / "tributo" -> type inclui "das","darf","boleto"
- "nota fiscal" -> "nfe","nfse"
- Se ano nao explicito mas frase tipo "ano passado" e hoje 2026 -> 2025
- "empresa X" -> issuerKeyword = "X"
- Se nao tiver certeza de algum campo, omita.`,
        }],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { keywords: query.split(/\s+/) };
      return JSON.parse(jsonMatch[0]);
    } catch (err: any) {
      this.logger.warn(`parseDocumentSearch falhou: ${err.message}`);
      return { keywords: query.split(/\s+/).filter((w) => w.length > 2) };
    }
  }

  // ─── Chat Copilot Contábil ────────────────────────────────────────────────

  async chat(
    mensagem: string,
    historico: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    contexto?: { cnpj?: string; regime?: string; mes?: string },
  ): Promise<string> {
    if (!this.hasKey) {
      return 'Configure ANTHROPIC_API_KEY no arquivo .env para ativar o Copilot de IA.';
    }

    const systemPrompt = `Você é a Aura, assistente especialista em contabilidade brasileira do sistema NEXACONTABIL.

Suas especialidades:
- Tributação brasileira (Simples Nacional, Lucro Presumido, Lucro Real, MEI)
- NF-e, NFS-e, CT-e e obrigações acessórias (SPED, eSocial, EFD)
- Folha de pagamento, INSS, IRRF, FGTS
- Planejamento tributário e elisão fiscal lícita
- Abertura e encerramento de empresas
- Contabilidade societária e DRE/Balanço

${contexto ? `Contexto da empresa: CNPJ ${contexto.cnpj ?? 'N/I'}, Regime: ${contexto.regime ?? 'N/I'}, Período: ${contexto.mes ?? new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` : ''}

Responda sempre em português brasileiro, de forma clara e profissional. Para cálculos, mostre o passo a passo.`;

    try {
      const messages: Anthropic.MessageParam[] = [
        ...historico.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: mensagem },
      ];

      const msg = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });

      return msg.content[0].type === 'text' ? msg.content[0].text : 'Sem resposta.';
    } catch (err: any) {
      this.logger.error(`Erro no chat Claude: ${err.message}`);
      return `Erro ao conectar com IA: ${err.message}`;
    }
  }

  // ─── Stubs (fallback sem API Key) ─────────────────────────────────────────

  private _stubDocumento(): DocumentoExtraido {
    return {
      tipo: 'outro',
      confidence: 0,
      sugestoesContabeis: ['Configure ANTHROPIC_API_KEY para processamento com IA'],
    };
  }

  private _stubReconciliacao(
    sources: Array<{ id: string; valor: number }>,
    targets: Array<{ id: string; valor: number }>,
  ): ReconciliacaoResult {
    // Matching simples por valor exato como fallback
    const matches: ReconciliacaoMatch[] = [];
    const usedTargets = new Set<string>();
    const usedSources = new Set<string>();

    for (const s of sources) {
      const t = targets.find(
        tg => !usedTargets.has(tg.id) && Math.abs(tg.valor - s.valor) < 0.01,
      );
      if (t) {
        matches.push({ sourceId: s.id, targetId: t.id, score: 0.95, motivo: 'Valor exato' });
        usedTargets.add(t.id);
        usedSources.add(s.id);
      }
    }

    return {
      matches,
      unmatchedSources: sources.filter(s => !usedSources.has(s.id)).map(s => s.id),
      unmatchedTargets: targets.filter(t => !usedTargets.has(t.id)).map(t => t.id),
      totalMatchedValue: matches.reduce((sum, m) => {
        const src = sources.find(s => s.id === m.sourceId);
        return sum + (src?.valor ?? 0);
      }, 0),
      totalUnmatchedValue: 0,
      observacoes: 'Reconciliação por valor exato (configure ANTHROPIC_API_KEY para matching inteligente)',
    };
  }
}
