import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';

interface IncomingMessage {
  from: string;            // phone number with country code
  body: string;            // texto da mensagem
  mediaUrl?: string;       // anexo opcional
}

export interface WhatsappReply {
  text: string;
  pdfUrl?: string;
  escalateToHuman?: boolean;
}

/**
 * Bot WhatsApp do escritorio.
 * Recebe mensagens, identifica o cliente pelo numero, responde FAQs
 * basicas com Claude usando contexto fiscal real.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Encontra o User+Company correspondente ao numero de telefone.
   * Heuristica simples: procura User com role 'cliente' e telefone
   * registrado. Em producao, mapa explicito numero -> companyId.
   */
  private async identifyClient(phone: string) {
    const clean = phone.replace(/\D/g, '');
    // procura empresa com mesmo phone
    const company = await this.prisma.company.findFirst({
      where: { phone: { contains: clean.slice(-9) } },
    });
    if (!company) return null;
    return { company };
  }

  /**
   * Registra/atualiza a conversa do WhatsApp como um Atendimento na Central
   * (substitui o uso do MEGA: todo atendimento vira ticket gerenciável aqui).
   * Upsert por telefone pra não duplicar a cada mensagem.
   */
  private async registrarAtendimento(phone: string, company: any | null, body: string) {
    try {
      const externalId = phone.replace(/\D/g, '');
      const existing = await this.prisma.atendimento.findFirst({ where: { canal: 'whatsapp', externalId } });
      let atendimentoId: string;
      if (existing) {
        await this.prisma.atendimento.update({
          where: { id: existing.id },
          data: { mensagem: body, status: existing.status === 'resolvido' ? 'aberto' : existing.status },
        });
        atendimentoId = existing.id;
      } else {
        const novo = await this.prisma.atendimento.create({
          data: {
            canal: 'whatsapp', externalId, companyId: company?.id ?? null,
            clienteNome: company?.name ?? 'Contato não identificado', contato: phone,
            assunto: 'Atendimento WhatsApp', mensagem: body, categoria: 'fiscal', status: 'aberto',
          },
        });
        atendimentoId = novo.id;
      }
      // grava a mensagem recebida na thread
      await this.prisma.atendimentoMensagem.create({
        data: { atendimentoId, direcao: 'in', texto: body, canal: 'whatsapp' },
      });
      return atendimentoId;
    } catch (e: any) {
      this.logger.warn(`registrarAtendimento falhou: ${e?.message ?? e}`);
      return null;
    }
  }

  async handleIncoming(msg: IncomingMessage): Promise<WhatsappReply> {
    this.logger.log(`WhatsApp in from ${msg.from}: "${msg.body.slice(0, 80)}"`);

    const ctx = await this.identifyClient(msg.from);
    const atendimentoId = await this.registrarAtendimento(msg.from, ctx?.company ?? null, msg.body);

    const reply = await this.computeReply(msg, ctx);

    // registra a resposta da IA na thread (autor='IA'), pra a equipe ver
    if (atendimentoId && reply?.text) {
      await this.prisma.atendimentoMensagem.create({
        data: { atendimentoId, direcao: 'out', texto: reply.text, autor: 'IA', canal: 'whatsapp' },
      }).catch(() => undefined);
      // se a IA pediu escalonamento, marca como prioridade alta
      if (reply.escalateToHuman) {
        await this.prisma.atendimento.update({ where: { id: atendimentoId }, data: { prioridade: 'alta' } }).catch(() => undefined);
      }
    }
    return reply;
  }

  private async computeReply(msg: IncomingMessage, ctx: { company: any } | null): Promise<WhatsappReply> {
    if (!ctx) {
      return { text: '👋 Olá! Não identifiquei seu cadastro. Por favor entre em contato com seu contador para vincular este número.' };
    }
    const company = ctx.company;
    const body = msg.body.toLowerCase().trim();

    // Quick patterns — não gasta Claude para perguntas simples
    if (/(das|imposto|pagar|guia)/.test(body)) return this.respondDAS(company.id, company.name);
    if (/(certid|cnd|negativa)/.test(body)) return this.respondCertidoes(company.id);
    if (/(obriga|vencen|calend|agenda)/.test(body)) return this.respondObrigacoes(company.id);
    if (/(nota|nfe|nfs)/.test(body)) return this.respondNotas(company.id);

    // Caso default: pergunta ao Claude com contexto da empresa
    return this.respondWithClaude(msg, company);
  }

  private async respondDAS(companyId: string, companyName: string): Promise<WhatsappReply> {
    const now = new Date();
    const proxMes = (now.getMonth() + 1) % 12 + 1;
    const ano = proxMes === 1 ? now.getFullYear() + 1 : now.getFullYear();
    const competencia = `${ano}-${String(proxMes).padStart(2, '0')}`;

    const obrigacao = await this.prisma.fiscalCalendarItem.findFirst({
      where: {
        companyId,
        tipo: { in: ['DAS', 'DARF'] },
        status: { in: ['pendente', 'apurada', 'em_apuracao'] },
        dataVencimento: { gte: new Date() },
      },
      orderBy: { dataVencimento: 'asc' },
    });

    if (!obrigacao) {
      return {
        text: `🧾 ${companyName}: não encontrei DAS pendente para os próximos meses. Seu calendário fiscal está em dia. Me chame se precisar de outra coisa.`,
      };
    }

    const venc = new Date(obrigacao.dataVencimento).toLocaleDateString('pt-BR');
    const valor = obrigacao.valorEstimado
      ? `R$ ${obrigacao.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : 'a ser calculado';

    return {
      text:
        `🧾 *${obrigacao.tipo} ${companyName}*\n\n` +
        `Competência: ${obrigacao.competencia}\n` +
        `Vencimento: *${venc}*\n` +
        `Valor estimado: ${valor}\n\n` +
        `Para a guia em PDF, peço que aguarde seu contador anexar aqui ou acessar o portal.`,
    };
  }

  private async respondCertidoes(companyId: string): Promise<WhatsappReply> {
    const certs = await this.prisma.certidao.findMany({
      where: { companyId },
      orderBy: { dataEmissao: 'desc' },
      take: 5,
    });
    if (certs.length === 0) {
      return {
        text: '📋 Não há certidões registradas. Vou avisar seu contador para emitir as principais (Federal, Estadual, Municipal, FGTS, Trabalhista).',
        escalateToHuman: true,
      };
    }
    const lines = certs.map((c) => {
      const venc = c.dataValidade
        ? `vence ${new Date(c.dataValidade).toLocaleDateString('pt-BR')}`
        : 'sem validade definida';
      const emoji = c.status === 'negativa' ? '✅' : c.status === 'positiva' ? '⚠️' : '🔵';
      return `${emoji} ${c.tipo.toUpperCase()} — ${c.status} (${venc})`;
    });
    return {
      text: `📋 *Suas certidões mais recentes:*\n\n${lines.join('\n')}`,
    };
  }

  private async respondObrigacoes(companyId: string): Promise<WhatsappReply> {
    const now = new Date();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);
    const items = await this.prisma.fiscalCalendarItem.findMany({
      where: {
        companyId,
        status: { in: ['pendente', 'apurada', 'em_apuracao', 'vencida'] },
        dataVencimento: { gte: now, lte: limite },
      },
      orderBy: { dataVencimento: 'asc' },
      take: 10,
    });
    if (items.length === 0) {
      return { text: '📅 Você não tem obrigações fiscais vencendo nos próximos 30 dias. Tranquilo por aqui!' };
    }
    const lines = items.map((o) => {
      const venc = new Date(o.dataVencimento).toLocaleDateString('pt-BR');
      return `• ${venc} — *${o.tipo}* (${o.competencia})`;
    });
    return {
      text: `📅 *Próximas obrigações (30 dias):*\n\n${lines.join('\n')}\n\nAcesse o portal pra ver tudo.`,
    };
  }

  private async respondNotas(companyId: string): Promise<WhatsappReply> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const docs = await this.prisma.document.count({
      where: { companyId, createdAt: { gte: monthStart }, type: { in: ['nfe', 'nfse'] } },
    });
    const fiscalNotes = await this.prisma.fiscalNote.count({
      where: { companyId, createdAt: { gte: monthStart } },
    });
    const total = docs + fiscalNotes;
    return {
      text: `🧾 *Notas do mês:* ${total} registrada(s)\n\nPara enviar XMLs ou PDFs, anexe direto aqui que a IA processa automaticamente.`,
    };
  }

  private async respondWithClaude(msg: IncomingMessage, company: any): Promise<WhatsappReply> {
    const answer = await this.ai.chat(
      msg.body,
      [],
      { cnpj: company.cnpj, regime: company.taxRegime },
    );
    return {
      text: answer.length > 1500 ? answer.slice(0, 1497) + '…' : answer,
    };
  }

  /**
   * Envia mensagem pelo Twilio. Sem WHATSAPP_TOKEN/PHONE_ID, apenas loga.
   */
  async sendMessage(to: string, body: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) {
      this.logger.warn(`[WhatsApp DEV] -> ${to}: ${body}`);
      return { ok: false, dev: true };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      });
      return { ok: res.ok, status: res.status };
    } catch (err: any) {
      this.logger.error(`WhatsApp send failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
