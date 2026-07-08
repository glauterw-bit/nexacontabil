import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const ENTREGUE = new Set(['paga', 'isenta', 'entregue']);
function safe(s: any) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } }
const r2 = (n: number) => Math.round((n ?? 0) * 100) / 100;

/**
 * PAINEL DO CLIENTE (mobile). Um endpoint só, tudo que o cliente precisa ver do
 * celular — escopado à PRÓPRIA empresa (o companyId vem do usuário logado, nunca
 * do request, e o guard/middleware já barram acesso a outra empresa).
 */
@Injectable()
export class PortalMobileService {
  constructor(private readonly prisma: PrismaService) {}

  private resolverCompanyId(user: any, companyIdParam?: string): string {
    // cliente: sempre a própria empresa. gestor: pode pré-visualizar passando companyId.
    if (user?.role === 'cliente') {
      if (!user.companyId) throw new BadRequestException('Seu usuário não está vinculado a uma empresa. Fale com o escritório.');
      return user.companyId;
    }
    const id = companyIdParam ?? user?.companyId;
    if (!id) throw new BadRequestException('Informe a empresa (companyId) para pré-visualizar.');
    return id;
  }

  async meuPainel(user: any, companyIdParam?: string) {
    const companyId = this.resolverCompanyId(user, companyIdParam);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true, taxRegime: true },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada.');

    const now = new Date();
    const nowComp = now.toISOString().slice(0, 7);
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [obrigMes, honor, docsMes, ultimoDoc] = await Promise.all([
      this.prisma.fiscalCalendarItem.findMany({
        where: { companyId, dataVencimento: { gte: inicioMes, lte: fimMes } },
        orderBy: { dataVencimento: 'asc' },
        select: { tipo: true, descricao: true, dataVencimento: true, status: true, valorEstimado: true, valorPago: true },
      }),
      this.prisma.honorario.findMany({
        where: { companyId },
        orderBy: { vencimento: 'asc' },
        select: { descricao: true, competencia: true, valor: true, vencimento: true, status: true },
      }),
      this.prisma.document.findMany({
        where: { companyId, issueDate: { gte: inicioMes } },
        select: { originalFilename: true, type: true, totalValue: true, issuerName: true, issueDate: true, createdAt: true, fiscalValidation: true },
        orderBy: { createdAt: 'desc' }, take: 500,
      }),
      this.prisma.document.aggregate({ where: { companyId }, _max: { createdAt: true } }),
    ]);

    // ── GUIAS / IMPOSTOS DO MÊS ──
    let guiasVencidas = 0, guiasAVencer = 0, guiasPagas = 0;
    const guias = obrigMes.map((o) => {
      const venc = new Date(o.dataVencimento);
      const entregue = ENTREGUE.has(o.status);
      const vencida = !entregue && (o.status === 'vencida' || venc < now);
      if (entregue) guiasPagas++; else if (vencida) guiasVencidas++; else guiasAVencer++;
      return {
        nome: o.descricao || o.tipo, tipo: o.tipo,
        vencimento: o.dataVencimento,
        valor: o.valorPago ?? o.valorEstimado ?? null,
        situacao: entregue ? 'paga' : vencida ? 'vencida' : 'a_vencer',
      };
    });

    // ── HONORÁRIOS (o que o cliente deve ao escritório) ──
    let honTotalPendente = 0, honTotalAtrasado = 0;
    const hoje0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const honorarios = honor
      .filter((h) => h.status !== 'pago' && h.status !== 'cancelado')
      .map((h) => {
        const atrasado = h.status === 'atrasado' || new Date(h.vencimento) < hoje0;
        if (atrasado) honTotalAtrasado += h.valor ?? 0; else honTotalPendente += h.valor ?? 0;
        return { descricao: h.descricao, competencia: h.competencia, valor: h.valor, vencimento: h.vencimento, atrasado };
      });

    // ── DOCUMENTOS DO MÊS ──
    let valorMes = 0, comInconsist = 0;
    for (const d of docsMes) {
      valorMes += d.totalValue ?? 0;
      const inc = safe(d.fiscalValidation)?.inconsistencias ?? [];
      if (inc.length) comInconsist++;
    }
    const recentes = docsMes.slice(0, 5).map((d) => ({
      nome: d.issuerName || d.originalFilename, tipo: d.type, valor: d.totalValue ?? null, em: d.issueDate ?? d.createdAt,
    }));

    // ── PENDÊNCIAS DO CLIENTE (o que ELE precisa fazer) ──
    const pendencias: { texto: string; prioridade: 'alta' | 'media' }[] = [];
    if (docsMes.length === 0) pendencias.push({ texto: `Envie as notas fiscais de ${nowComp.split('-').reverse().join('/')} para começarmos sua contabilidade do mês.`, prioridade: 'alta' });
    if (!['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI'].includes(company.taxRegime ?? '')) pendencias.push({ texto: 'Confirme com o escritório o regime tributário da sua empresa.', prioridade: 'media' });
    if (honTotalAtrasado > 0) pendencias.push({ texto: 'Há honorário(s) em atraso — regularize para manter os serviços em dia.', prioridade: 'media' });

    // ── STATUS / SEMÁFORO (linguagem do cliente) ──
    let status: 'verde' | 'amarelo' | 'vermelho';
    let titulo: string, resumo: string;
    if (guiasVencidas > 0 || docsMes.length === 0) {
      status = 'vermelho';
      titulo = 'Precisa da sua atenção';
      resumo = docsMes.length === 0 ? 'Estamos aguardando suas notas do mês.' : `${guiasVencidas} guia(s) vencida(s).`;
    } else if (pendencias.length > 0 || honTotalAtrasado > 0 || guiasAVencer > 0) {
      status = 'amarelo';
      titulo = 'Quase tudo em dia';
      resumo = guiasAVencer > 0 ? `${guiasAVencer} guia(s) a vencer este mês.` : 'Alguns pontos para acompanhar.';
    } else {
      status = 'verde';
      titulo = 'Tudo em dia ✅';
      resumo = 'Sua contabilidade está em ordem este mês.';
    }

    return {
      empresa: { nome: company.name, cnpj: company.cnpj, regime: company.taxRegime },
      competencia: nowComp,
      atualizadoEm: ultimoDoc._max.createdAt ?? null,
      status: { cor: status, titulo, resumo },
      pendencias,
      guias: { itens: guias, vencidas: guiasVencidas, aVencer: guiasAVencer, pagas: guiasPagas },
      honorarios: { itens: honorarios, totalPendente: r2(honTotalPendente), totalAtrasado: r2(honTotalAtrasado) },
      documentos: { totalMes: docsMes.length, valorMes: r2(valorMes), comInconsistencia: comInconsist, recentes },
      contato: {
        whatsapp: process.env.OFFICE_WHATSAPP ?? process.env.ESCRITORIO_WHATSAPP ?? null,
        atendimentoInterno: true,
      },
    };
  }

  /** Cliente abre um chamado (atendimento) para o escritório, direto do painel. */
  async abrirChamado(user: any, body: { assunto?: string; mensagem: string; categoria?: string }) {
    const companyId = this.resolverCompanyId(user);
    if (!body?.mensagem?.trim()) throw new BadRequestException('Escreva a mensagem do chamado.');
    const at = await this.prisma.atendimento.create({
      data: {
        canal: 'portal',
        companyId,
        clienteNome: user?.name ?? null,
        contato: user?.email ?? null,
        assunto: body.assunto?.trim() || 'Contato pelo app do cliente',
        mensagem: body.mensagem.trim(),
        categoria: body.categoria ?? 'outro',
        status: 'aberto',
        prioridade: 'normal',
      },
    });
    return { ok: true, id: at.id };
  }
}
