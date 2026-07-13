import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** Templates de checklist de fechamento por departamento (ordem = fluxo de trabalho). */
export const CHECKLIST_TEMPLATES: Record<string, { key: string; label: string }[]> = {
  fiscal: [
    { key: 'triagem_xml', label: 'Triagem dos XMLs (entradas e saídas recebidas)' },
    { key: 'apuracao', label: 'Apuração dos impostos (ICMS/PIS/COFINS/IPI/ISS)' },
    { key: 'validacao_recibo', label: 'Validação: conferir o que compete no mês' },
    { key: 'entrega_guias', label: 'Emissão/entrega das guias (DAS/DARF/GARE)' },
    { key: 'entrega_acessorias', label: 'Entrega das obrigações acessórias (SPED/EFD/DCTF/GIA)' },
    { key: 'arquivar_recibos', label: 'Arquivar os recibos de entrega das obrigações' },
    { key: 'checklist_final', label: 'Checklist finalizado e enviado' },
  ],
  contabil: [
    { key: 'triagem_docs', label: 'Triagem (extratos, contas a pagar/receber, ativos, estoque)' },
    { key: 'lancamentos', label: 'Lançamentos contábeis' },
    { key: 'conciliacao', label: 'Conciliação bancária' },
    { key: 'fechamento', label: 'Fechamento do período' },
    { key: 'relatorios', label: 'Relatórios (Balancete/DRE/Balanço)' },
    { key: 'envio', label: 'Fluxo de envio (lançamento no Domínio)' },
  ],
  folha: [
    { key: 'receber_folha', label: 'Receber os dados da folha (admissões, faltas, horas)' },
    { key: 'calcular', label: 'Calcular a folha (proventos, descontos, encargos)' },
    { key: 'guias', label: 'Gerar as guias (FGTS/INSS/IRRF)' },
    { key: 'esocial', label: 'Enviar eventos do eSocial' },
    { key: 'holerites', label: 'Entregar holerites e recibos' },
  ],
};

@Injectable()
export class ChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  private compAtual() { return new Date().toISOString().slice(0, 7); }

  /** Checklist de um cliente num depto/competência: template + estado (feito/não). */
  async doCliente(companyId: string, departamento: string, competencia?: string) {
    const dep = departamento in CHECKLIST_TEMPLATES ? departamento : 'fiscal';
    const comp = competencia ?? this.compAtual();
    const template = CHECKLIST_TEMPLATES[dep];
    const estados = await this.prisma.checklistState.findMany({
      where: { companyId, competencia: comp, departamento: dep },
    });
    const byKey = new Map(estados.map((e) => [e.itemKey, e]));
    const itens = template.map((t) => {
      const e = byKey.get(t.key);
      return { key: t.key, label: t.label, feito: e?.feito ?? false, feitoEm: e?.feitoEm ?? null, obs: e?.obs ?? null };
    });
    const feitos = itens.filter((i) => i.feito).length;
    return { companyId, departamento: dep, competencia: comp, itens, feitos, total: itens.length, pct: itens.length ? Math.round((feitos / itens.length) * 100) : 0 };
  }

  /** Marca/desmarca um item. */
  async marcar(companyId: string, departamento: string, itemKey: string, feito: boolean, competencia?: string, feitoPor?: string) {
    const dep = departamento in CHECKLIST_TEMPLATES ? departamento : 'fiscal';
    if (!CHECKLIST_TEMPLATES[dep].some((t) => t.key === itemKey)) throw new BadRequestException('Item inválido.');
    const comp = competencia ?? this.compAtual();
    await this.prisma.checklistState.upsert({
      where: { companyId_competencia_departamento_itemKey: { companyId, competencia: comp, departamento: dep, itemKey } },
      update: { feito, feitoEm: feito ? new Date() : null, feitoPor: feito ? feitoPor : null },
      create: { companyId, competencia: comp, departamento: dep, itemKey, feito, feitoEm: feito ? new Date() : null, feitoPor },
    });
    return this.doCliente(companyId, dep, comp);
  }

  /** Visão da carteira: % de conclusão do checklist por depto (para o gestor). */
  async overview(competencia?: string) {
    const comp = competencia ?? this.compAtual();
    const companies = await this.prisma.company.findMany({ where: { active: true }, select: { id: true } });
    const estados = await this.prisma.checklistState.findMany({ where: { competencia: comp, feito: true }, select: { companyId: true, departamento: true } });
    const feitosPor = new Map<string, number>(); // `${companyId}|${dep}` -> count
    for (const e of estados) feitosPor.set(`${e.companyId}|${e.departamento}`, (feitosPor.get(`${e.companyId}|${e.departamento}`) ?? 0) + 1);
    const deps = Object.keys(CHECKLIST_TEMPLATES);
    const resumo: Record<string, { completos: number; total: number }> = {};
    for (const dep of deps) {
      const totalItens = CHECKLIST_TEMPLATES[dep].length;
      let completos = 0;
      for (const c of companies) if ((feitosPor.get(`${c.id}|${dep}`) ?? 0) >= totalItens) completos++;
      resumo[dep] = { completos, total: companies.length };
    }
    return { competencia: comp, clientes: companies.length, resumo };
  }
}
