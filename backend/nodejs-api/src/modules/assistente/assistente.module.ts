import { Module, Controller, Post, Body, UseGuards, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiModule } from '../ai/ai.module';
import { BuscaDocsService } from '../busca-docs/busca-docs.service';
import { BuscaDocsModule } from '../busca-docs/busca-docs.module';

/* ── Assistente conversacional do DomoSYS ──
   O usuário fala em linguagem natural e o assistente resolve UMA de três ações:
   • navegar   → leva para a tela certa (com o cliente já selecionado quando fizer sentido)
   • documentos→ busca e traz os documentos ali mesmo (com download)
   • resposta  → responde a pergunta (IA contábil), sem sair da tela
   Reaproveita a busca em linguagem natural (busca-docs) e a IA (Claude, com fallback por regras). */

// Catálogo de telas que o assistente sabe abrir. `precisaCliente` = a rota é de UM cliente.
const ROTAS: { chave: string; rota: string; precisaCliente?: boolean; desc: string; termos: RegExp }[] = [
  { chave: 'operacao',        rota: '/operacao',        desc: 'situação geral da carteira, semáforo, docs, declarações', termos: /(opera|semaforo|semáforo|carteira geral|situa)/i },
  { chave: 'farois',          rota: '/farois',          desc: 'riscos e oportunidades: sublimite, queda, monofásico, prazos da reforma', termos: /(far[oó]|risco|oportunidad|monof|sublimite|concentra|reforma)/i },
  { chave: 'gerencial',       rota: '/gerencial',       desc: 'painel do gestor: produção, SLA, gargalo, equipe', termos: /(gerencial|gestor|produtiv|equipe|gargalo|sla|pulso)/i },
  { chave: 'meu-dia',         rota: '/meu-dia',         desc: 'tarefas e pendências do dia priorizadas', termos: /(meu dia|hoje|minhas? (tarefa|pend)|a fazer)/i },
  { chave: 'prazos',          rota: '/prazos',          desc: 'calendário de obrigações e vencimentos (DAS, DCTFWeb, FGTS, ECF)', termos: /(prazo|venciment|obriga|calend|agenda|das|dctf|ecf|fgts)/i },
  { chave: 'inconsistencias', rota: '/inconsistencias', desc: 'malha fina interna: notas com erro fiscal', termos: /(inconsist|malha|erro fiscal|diverg|irregular)/i },
  { chave: 'apuracao',        rota: '/apuracao',        desc: 'apuração de impostos por competência', termos: /(apura|imposto apurad|calcul.*imposto)/i },
  { chave: 'ficha',           rota: '/cliente-erros',   precisaCliente: true, desc: 'ficha de UM cliente: erros fiscais + score de saúde + como corrigir', termos: /(ficha|detalhe.*cliente|saude|saúde|score|erros? d[eo])/i },
  { chave: 'organizacao',     rota: '/organizacao',     desc: 'documentos organizados por cliente e competência', termos: /(organiza|arquivo|pasta|documentos organiz)/i },
  { chave: 'solicitacoes',    rota: '/solicitacoes',    desc: 'o que solicitar a cada cliente (pendências documentais)', termos: /(solicit|pedir|cobra.*doc|falta.*doc)/i },
  { chave: 'carteira',        rota: '/carteira',        desc: 'lista completa de clientes', termos: /(lista.*client|carteira de client|todos os client)/i },
  { chave: 'folha',           rota: '/folha',           desc: 'folha de pagamento', termos: /(folha|holerite|sal[aá]rio|funcion)/i },
  { chave: 'boletos',         rota: '/boletos',         desc: 'boletos e honorários', termos: /(boleto|honor[aá]rio|cobran)/i },
  { chave: 'dre',             rota: '/relatorios/dre',  desc: 'DRE — demonstração de resultado', termos: /(dre|resultado do exerc|lucro.*prejuizo)/i },
  { chave: 'fluxo',           rota: '/fluxo',           desc: 'quadro de trabalho e recibos de entrega', termos: /(fluxo|recibo|quadro de trabalho|entrega)/i },
];

interface AcaoAssistente {
  tipo: 'navegar' | 'documentos' | 'resposta';
  fala: string;
  rota?: string;
  cliente?: { id: string; nome: string } | null;
  documentos?: any[];
  total?: number;
}

@Injectable()
class AssistenteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly busca: BuscaDocsService,
  ) {}

  /** Resolve um cliente pelo nome citado (fuzzy simples: contains, insensível). */
  private async acharCliente(ref?: string): Promise<{ id: string; nome: string } | null> {
    if (!ref || ref.trim().length < 2) return null;
    const termo = ref.trim();
    const cos = await this.prisma.company.findMany({
      where: { name: { contains: termo, mode: 'insensitive' } },
      select: { id: true, name: true }, take: 1,
    });
    return cos[0] ? { id: cos[0].id, nome: cos[0].name } : null;
  }

  private pareceDocumento(msg: string): boolean {
    return /(nota|notas|nf-?e|nfse|danfe|documento|documentos|xml|boleto|extrato|recibo|comprovante|arquiv)/i.test(msg)
      && /(mostr|ver|abrir|busca|procur|traz|encontr|quero|lista|baix|acha)/i.test(msg);
  }

  async comando(mensagem: string, companyId?: string, historico: any[] = []): Promise<AcaoAssistente> {
    const msg = (mensagem || '').trim();
    if (!msg) return { tipo: 'resposta', fala: 'Pode me dizer o que você precisa? Ex.: "abrir os faróis", "mostrar as notas com erro da Elétrica DJ", "como apurar o DAS".' };

    // 1) tenta a IA para classificar intenção + extrair cliente
    let plano: any = null;
    try {
      plano = await this.classificarComIA(msg);
    } catch { /* cai no fallback */ }

    // 2) fallback por regras quando a IA não está disponível/decidiu mal
    if (!plano?.acao) plano = this.classificarPorRegras(msg);

    // ── DOCUMENTOS ──
    if (plano.acao === 'documentos') {
      const consulta = plano.consultaDocs || msg;
      let res: any;
      try { res = await this.busca.buscar(consulta); } catch { res = null; }
      const docs = (res?.resultados ?? res?.docs ?? res ?? []).slice?.(0, 40) ?? [];
      const n = docs.length;
      return {
        tipo: 'documentos',
        fala: n ? `Encontrei ${n} documento${n > 1 ? 's' : ''} para "${consulta}". Toque para abrir ou baixar.`
                : `Não encontrei documentos para "${consulta}". Tente citar o cliente, o tipo (nota, boleto) ou um valor.`,
        documentos: docs, total: n,
      };
    }

    // ── NAVEGAR ──
    if (plano.acao === 'navegar' && plano.rotaChave) {
      const cat = ROTAS.find((r) => r.chave === plano.rotaChave);
      if (cat) {
        let cliente: { id: string; nome: string } | null = null;
        let rota = cat.rota;
        if (cat.precisaCliente) {
          cliente = await this.acharCliente(plano.clienteRef);
          if (!cliente && companyId) {
            const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
            cliente = c ? { id: c.id, nome: c.name } : null;
          }
          if (cliente) rota = `${cat.rota}?companyId=${cliente.id}`;
          else return { tipo: 'resposta', fala: `Para abrir a ficha eu preciso saber qual cliente. Me diga o nome — ex.: "ficha da Gesso Mix".` };
        }
        return {
          tipo: 'navegar', rota, cliente,
          fala: `Abrindo ${cat.desc.split(':')[0].split(',')[0]}${cliente ? ` — ${cliente.nome}` : ''}.`,
        };
      }
    }

    // ── RESPOSTA (IA contábil) ──
    let resposta = plano.resposta;
    if (!resposta) {
      const ctx = companyId ? await this.prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true, taxRegime: true } }) : null;
      try {
        resposta = await this.ai.chat(msg, historico.slice(-6), ctx ? { cnpj: ctx.cnpj ?? undefined, regime: ctx.taxRegime ?? undefined } : undefined);
      } catch { resposta = 'No momento não consegui processar. Tente reformular ou peça para abrir uma tela específica.'; }
    }
    return { tipo: 'resposta', fala: resposta };
  }

  /** Classificação via Claude → { acao, rotaChave, clienteRef, consultaDocs, resposta }. */
  private async classificarComIA(msg: string): Promise<any> {
    if (!(this.ai as any).hasKey) throw new Error('sem IA');
    const catalogo = ROTAS.map((r) => `- ${r.chave}: ${r.desc}`).join('\n');
    const prompt = `Você roteia comandos de um sistema contábil brasileiro. O usuário disse:
"${msg}"

Telas disponíveis (chave: descrição):
${catalogo}

Decida UMA ação e responda APENAS com JSON válido:
{
  "acao": "navegar" | "documentos" | "resposta",
  "rotaChave": "<chave da tela, só se acao=navegar>",
  "clienteRef": "<nome do cliente citado, se houver>",
  "consultaDocs": "<a busca de documentos em linguagem natural, só se acao=documentos>",
  "resposta": "<responda diretamente, só se acao=resposta e for pergunta conceitual contábil curta>"
}
Regras:
- Se o usuário quer VER/BUSCAR notas, boletos, XMLs, documentos → acao=documentos (consultaDocs = a frase dele).
- Se quer ABRIR uma tela/painel/análise → acao=navegar (rotaChave da lista). "ficha/saúde/erros de <cliente>" → rotaChave=ficha e clienteRef=<cliente>.
- Se é uma dúvida conceitual (como calcular X, o que é Y) → acao=resposta.
- Não invente rotaChave fora da lista.`;
    const raw = await this.ai.chat(prompt, [], undefined);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('sem json');
    return JSON.parse(m[0]);
  }

  /** Fallback determinístico por palavras-chave (funciona sem ANTHROPIC_API_KEY). */
  private classificarPorRegras(msg: string): any {
    if (this.pareceDocumento(msg)) return { acao: 'documentos', consultaDocs: msg };
    // tenta casar uma rota pelos termos; a mais específica primeiro (ficha exige cliente)
    for (const r of ROTAS) {
      if (r.termos.test(msg)) {
        const out: any = { acao: 'navegar', rotaChave: r.chave };
        if (r.precisaCliente) {
          // extrai "da/do <cliente>" como referência
          const m = msg.match(/\b(?:d[aeo]s?|cliente)\s+([A-Za-zÀ-ú0-9][\wÀ-ú .&-]{2,})/i);
          if (m) out.clienteRef = m[1].trim();
        }
        return out;
      }
    }
    return { acao: 'resposta' };
  }
}

@Controller('assistente')
@UseGuards(JwtAuthGuard)
class AssistenteController {
  constructor(private readonly svc: AssistenteService) {}

  @Post('comando')
  comando(@Body() body: { mensagem: string; companyId?: string; historico?: any[] }) {
    return this.svc.comando(body?.mensagem ?? '', body?.companyId, body?.historico ?? []);
  }
}

@Module({
  imports: [AiModule, BuscaDocsModule],
  controllers: [AssistenteController],
  providers: [AssistenteService, PrismaService],
})
export class AssistenteModule {}
