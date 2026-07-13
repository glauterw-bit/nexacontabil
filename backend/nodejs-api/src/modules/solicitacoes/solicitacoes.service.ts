import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
const REGIMES = new Set(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI']);

@Injectable()
export class SolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Para cada cliente ativo, lista o que FALTA — pro analista solicitar.
   * Leitura única (sem re-baixar do drive). Seguro p/ o banco.
   */
  async overview() {
    const companies = await this.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true, taxRegime: true, cnpj: true },
    });
    const ids = companies.map((c) => c.id);
    const docs = await this.prisma.document.findMany({
      where: { companyId: { in: ids }, extractedData: { not: null } },
      select: { companyId: true, issueDate: true, extractedData: true, fiscalValidation: true },
    });

    const agg = new Map<string, { docs: number; entradas: number; saidas: number; meses: Set<string>; inc: number }>();
    for (const d of docs) {
      const a = agg.get(d.companyId) ?? { docs: 0, entradas: 0, saidas: 0, meses: new Set<string>(), inc: 0 };
      a.docs++;
      const nf = safe(d.extractedData);
      const dir = String(nf?.itens?.[0]?.cfop ?? '')[0];
      if (['1', '2', '3'].includes(dir)) a.entradas++;
      else if (['5', '6', '7'].includes(dir)) a.saidas++;
      if (d.issueDate) a.meses.add(new Date(d.issueDate).toISOString().slice(0, 7));
      a.inc += safe(d.fiscalValidation)?.inconsistencias?.length ?? 0;
      agg.set(d.companyId, a);
    }

    const clientes = companies.map((c) => {
      const a = agg.get(c.id);
      const pend: { tipo: string; prioridade: string; texto: string }[] = [];
      if (!a || a.docs === 0) {
        pend.push({ tipo: 'documentos', prioridade: 'alta', texto: 'Enviar os XMLs do período — nenhum documento foi recebido/analisado ainda.' });
      } else {
        if (a.entradas === 0) pend.push({ tipo: 'entradas', prioridade: 'alta', texto: 'Enviar as notas de ENTRADA (compras) — necessárias para o crédito de ICMS e apuração completa.' });
        if (a.inc > 0) pend.push({ tipo: 'correcao', prioridade: 'media', texto: `${a.inc} nota(s) com inconsistência fiscal — confirmar tributação ou justificar.` });
      }
      if (!REGIMES.has(c.taxRegime ?? '')) pend.push({ tipo: 'regime', prioridade: 'media', texto: 'Confirmar o regime tributário da empresa.' });
      if ((c.cnpj ?? '').replace(/\D/g, '').startsWith('7')) pend.push({ tipo: 'cadastro', prioridade: 'baixa', texto: 'Confirmar o CNPJ (cadastro provisório no sistema).' });
      return { companyId: c.id, nome: c.name, regime: c.taxRegime, docs: a?.docs ?? 0, entradas: a?.entradas ?? 0, pendencias: pend };
    }).filter((c) => c.pendencias.length > 0)
      .sort((x, y) => {
        const peso = (p: any[]) => p.reduce((s, i) => s + (i.prioridade === 'alta' ? 3 : i.prioridade === 'media' ? 2 : 1), 0);
        return peso(y.pendencias) - peso(x.pendencias);
      });

    const conta = (tipo: string) => clientes.filter((c) => c.pendencias.some((p) => p.tipo === tipo)).length;
    return {
      totalAtivos: companies.length,
      comPendencia: clientes.length,
      resumo: {
        semDocumentos: conta('documentos'),
        semEntradas: conta('entradas'),
        comInconsistencia: conta('correcao'),
        semRegime: conta('regime'),
        cnpjProvisorio: conta('cadastro'),
      },
      clientes,
    };
  }

  /**
   * SOLICITAÇÃO MENSAL AUTOMÁTICA (dia 01/02) — para cada cliente com pendência,
   * cria/garante uma SolicitacaoDoc da competência com a mensagem pronta. Idempotente
   * (unique companyId+competencia): rodar de novo no dia 02 não duplica.
   */
  async gerarSolicitacoesMensais(competencia?: string) {
    const comp = competencia ?? new Date().toISOString().slice(0, 7);
    const ov = await this.overview();
    let criadas = 0, jaExistiam = 0;
    for (const c of ov.clientes) {
      const itens = c.pendencias.map((p) => `• ${p.texto}`).join('\n');
      const texto = `Olá! Estamos iniciando o fechamento de ${comp.split('-').reverse().join('/')}. Para manter sua contabilidade em dia, precisamos de:\n\n${itens}\n\nPode nos enviar assim que possível? 🙏`;
      const existe = await this.prisma.solicitacaoDoc.findUnique({ where: { companyId_competencia: { companyId: c.companyId, competencia: comp } }, select: { id: true } });
      if (existe) { jaExistiam++; continue; }
      await this.prisma.solicitacaoDoc.create({
        data: { companyId: c.companyId, competencia: comp, canal: 'auto', status: 'gerada', mensagem: texto, pendencias: JSON.stringify(c.pendencias) },
      }).then(() => criadas++).catch(() => undefined);
    }
    return { competencia: comp, clientesComPendencia: ov.clientes.length, criadas, jaExistiam };
  }

  /** Status das solicitações do mês (para o dashboard). */
  async statusMensal(competencia?: string) {
    const comp = competencia ?? new Date().toISOString().slice(0, 7);
    const solic = await this.prisma.solicitacaoDoc.findMany({ where: { competencia: comp }, select: { status: true } });
    const por = (s: string) => solic.filter((x) => x.status === s).length;
    return { competencia: comp, total: solic.length, geradas: por('gerada'), enviadas: por('enviada'), respondidas: por('respondida') };
  }

  /** Lista as solicitações da competência (para a tela). */
  async listarMensais(competencia?: string) {
    const comp = competencia ?? new Date().toISOString().slice(0, 7);
    const [solic, companies] = await Promise.all([
      this.prisma.solicitacaoDoc.findMany({ where: { competencia: comp }, orderBy: { createdAt: 'desc' } }),
      this.prisma.company.findMany({ select: { id: true, name: true } }),
    ]);
    const nome = new Map(companies.map((c) => [c.id, c.name]));
    return { competencia: comp, itens: solic.map((s) => ({ ...s, cliente: nome.get(s.companyId) ?? s.companyId, pendencias: safe(s.pendencias) ?? [] })) };
  }

  /** Marca uma solicitação como enviada (após disparar por WhatsApp/e-mail). */
  async marcarEnviada(id: string) {
    return this.prisma.solicitacaoDoc.update({ where: { id }, data: { status: 'enviada', enviadaEm: new Date() } });
  }

  /** Texto pronto pra enviar ao cliente (WhatsApp/e-mail). */
  async mensagem(companyId: string) {
    const ov = await this.overview();
    const c = ov.clientes.find((x) => x.companyId === companyId);
    if (!c) return { texto: 'Sem pendências para este cliente. ✅' };
    const itens = c.pendencias.map((p) => `• ${p.texto}`).join('\n');
    return {
      texto: `Olá! Para mantermos sua contabilidade em dia, precisamos do seguinte:\n\n${itens}\n\nPode nos enviar assim que possível? Qualquer dúvida estamos à disposição. 🙏`,
      cliente: c.nome,
    };
  }
}
