import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class AtendimentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async detalhe(id: string) {
    const atendimento = await this.prisma.atendimento.findUnique({ where: { id } });
    if (!atendimento) throw new NotFoundException('Atendimento não encontrado');
    const mensagens = await this.prisma.atendimentoMensagem.findMany({
      where: { atendimentoId: id }, orderBy: { createdAt: 'asc' },
    });
    return { atendimento, mensagens };
  }

  /** Responde pelo painel: grava na thread e envia ao cliente pelo canal. */
  async responder(id: string, texto: string, autor?: string) {
    const at = await this.prisma.atendimento.findUnique({ where: { id } });
    if (!at) throw new NotFoundException('Atendimento não encontrado');
    if (!texto?.trim()) return { ok: false, erro: 'Mensagem vazia.' };

    let envio: any = { ok: false, dev: true };
    if (at.canal === 'whatsapp' && at.contato) {
      envio = await this.whatsapp.sendMessage(at.contato.replace(/\D/g, ''), texto);
    }
    await this.prisma.atendimentoMensagem.create({
      data: { atendimentoId: id, direcao: 'out', texto, autor: autor ?? 'Escritório', canal: at.canal },
    });
    await this.prisma.atendimento.update({
      where: { id }, data: { status: at.status === 'aberto' ? 'em_andamento' : at.status },
    });
    return { ok: true, enviado: envio.ok === true, dev: envio.dev === true };
  }

  async listar(filtros: { canal?: string; status?: string; responsavel?: string; q?: string } = {}) {
    const where: any = {};
    if (filtros.canal) where.canal = filtros.canal;
    if (filtros.status) where.status = filtros.status;
    if (filtros.responsavel) where.responsavel = filtros.responsavel;
    if (filtros.q) where.OR = [
      { clienteNome: { contains: filtros.q, mode: 'insensitive' } },
      { assunto: { contains: filtros.q, mode: 'insensitive' } },
    ];
    return this.prisma.atendimento.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 });
  }

  async stats() {
    const all = await this.prisma.atendimento.findMany({ select: { canal: true, status: true, prioridade: true } });
    const porStatus: Record<string, number> = {};
    const porCanal: Record<string, number> = {};
    let urgentes = 0;
    for (const a of all) {
      porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;
      porCanal[a.canal] = (porCanal[a.canal] ?? 0) + 1;
      if (a.prioridade === 'urgente' && a.status !== 'resolvido') urgentes++;
    }
    return { total: all.length, abertos: porStatus['aberto'] ?? 0, emAndamento: porStatus['em_andamento'] ?? 0, resolvidos: porStatus['resolvido'] ?? 0, urgentes, porCanal };
  }

  async criar(data: any) {
    return this.prisma.atendimento.create({
      data: {
        canal: data.canal ?? 'manual',
        externalId: data.externalId ?? null,
        companyId: data.companyId ?? null,
        clienteNome: data.clienteNome ?? null,
        contato: data.contato ?? null,
        assunto: data.assunto ?? null,
        mensagem: data.mensagem ?? null,
        categoria: data.categoria ?? null,
        prioridade: data.prioridade ?? 'normal',
        responsavel: data.responsavel ?? null,
      },
    });
  }

  async atualizar(id: string, data: any) {
    const at = await this.prisma.atendimento.findUnique({ where: { id } });
    if (!at) throw new NotFoundException('Atendimento não encontrado');
    const patch: any = {};
    for (const k of ['status', 'responsavel', 'prioridade', 'categoria', 'assunto', 'mensagem']) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.status === 'resolvido' && at.status !== 'resolvido') patch.resolvedAt = new Date();
    if (data.status && data.status !== 'resolvido') patch.resolvedAt = null;
    return this.prisma.atendimento.update({ where: { id }, data: patch });
  }

  /**
   * Ingestão a partir do MEGA (ou outro sistema). Faz upsert por externalId
   * pra não duplicar quando o MEGA reenvia o mesmo ticket atualizado.
   * Aceita 1 ticket ou um lote.
   */
  async ingest(payload: any) {
    const tickets = Array.isArray(payload) ? payload : (payload?.tickets ?? [payload]);
    let criados = 0, atualizados = 0;
    for (const t of tickets) {
      const externalId = String(t.externalId ?? t.id ?? t.protocolo ?? '').trim();
      const base = {
        canal: t.canal ?? 'mega',
        companyId: t.companyId ?? null,
        clienteNome: t.clienteNome ?? t.cliente ?? null,
        contato: t.contato ?? t.telefone ?? t.email ?? null,
        assunto: t.assunto ?? t.titulo ?? null,
        mensagem: t.mensagem ?? t.descricao ?? null,
        categoria: t.categoria ?? null,
        prioridade: t.prioridade ?? 'normal',
        status: t.status ?? 'aberto',
        responsavel: t.responsavel ?? null,
      };
      const existing = externalId
        ? await this.prisma.atendimento.findFirst({ where: { externalId, canal: base.canal } })
        : null;
      if (existing) {
        await this.prisma.atendimento.update({ where: { id: existing.id }, data: base });
        atualizados++;
      } else {
        await this.prisma.atendimento.create({ data: { ...base, externalId: externalId || null } });
        criados++;
      }
    }
    return { recebidos: tickets.length, criados, atualizados };
  }
}
