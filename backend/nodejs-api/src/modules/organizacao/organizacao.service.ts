import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { direcaoPorCfop, ambitoPorCfop, tributacaoPorCst, monofasicoPorNcm } from './classificacao.util';

function safe(s: any) { try { return s ? JSON.parse(s) : null; } catch { return null; } }
const inc = (m: Map<string, { qtd: number; valor: number }>, k: string, v: number) => {
  const cur = m.get(k) ?? { qtd: 0, valor: 0 }; cur.qtd++; cur.valor += v || 0; m.set(k, cur);
};
const arr = (m: Map<string, { qtd: number; valor: number }>) =>
  [...m.entries()].map(([k, v]) => ({ chave: k, qtd: v.qtd, valor: Math.round(v.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);

@Injectable()
export class OrganizacaoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Organiza TODOS os documentos analisados por múltiplas dimensões
   * (cliente, natureza fiscal, natureza contábil, período, tributação).
   * Uma leitura só — sem re-baixar do drive (seguro p/ o banco).
   */
  async overview() {
    const docs = await this.prisma.document.findMany({
      where: { extractedData: { not: null } },
      select: { companyId: true, type: true, totalValue: true, issueDate: true, extractedData: true },
    });
    // inclui TODAS as empresas (ativas + inativas/históricas) — organiza todos os docs
    const companies = await this.prisma.company.findMany({ select: { id: true, name: true, taxRegime: true, segmentoFiscal: true, active: true } });
    const coById = new Map(companies.map((c) => [c.id, c]));
    let docsAtivos = 0, docsInativos = 0;

    const porTipoDoc = new Map<string, any>();      // nfe / nfse
    const porDirecao = new Map<string, any>();       // entrada / saída
    const porAmbito = new Map<string, any>();        // interna / interestadual / exterior
    const porTributacao = new Map<string, any>();    // tributado / st / isento / simples
    const porMes = new Map<string, any>();
    const porSegmento = new Map<string, any>();
    const porRegime = new Map<string, any>();
    const porNcm = new Map<string, any>();
    const monofasico = new Map<string, any>();       // grupos monofásicos
    const porCliente = new Map<string, { nome: string; regime: string; qtd: number; entradas: number; saidas: number; valor: number }>();

    let totalValor = 0, totalNotas = 0, notasMonofasico = 0;

    for (const d of docs) {
      const nf = safe(d.extractedData); if (!nf) continue;
      const v = d.totalValue ?? nf.totais?.produtos ?? 0;
      const co = coById.get(d.companyId);
      if (!co) continue; // empresa não existe mais
      totalValor += v; totalNotas++;
      if (co.active) docsAtivos++; else docsInativos++;
      inc(porTipoDoc, (d.type || 'outro').toUpperCase(), v);
      if (d.issueDate) inc(porMes, new Date(d.issueDate).toISOString().slice(0, 7), v);
      inc(porRegime, co.taxRegime ?? 'n/d', v);
      inc(porSegmento, co.segmentoFiscal ?? 'n/d', v);

      const cli = porCliente.get(d.companyId) ?? { nome: co.name, regime: co.taxRegime, qtd: 0, entradas: 0, saidas: 0, valor: 0 };
      cli.qtd++; cli.valor += v;

      // classifica pelos itens (usa o 1º item como predominante p/ direção/âmbito)
      const itens = nf.itens ?? [];
      const it0 = itens[0] ?? {};
      const dir = direcaoPorCfop(it0.cfop); inc(porDirecao, dir, v);
      if (dir === 'entrada') cli.entradas++; else if (dir === 'saida') cli.saidas++;
      inc(porAmbito, ambitoPorCfop(it0.cfop), v);
      porCliente.set(d.companyId, cli);

      let temMono = false;
      const tribVista = new Set<string>();
      for (const it of itens) {
        const trib = tributacaoPorCst(it.cst); if (trib !== 'indef') tribVista.add(trib);
        if (it.ncm) inc(porNcm, String(it.ncm), it.valor ?? 0);
        const grp = monofasicoPorNcm(it.ncm);
        if (grp) { inc(monofasico, grp, it.valor ?? 0); temMono = true; }
      }
      // tributação predominante da nota
      const tribNota = tribVista.has('st') ? 'st' : tribVista.has('simples') ? 'simples' : tribVista.has('tributado') ? 'tributado' : tribVista.has('isento') ? 'isento' : 'indef';
      inc(porTributacao, tribNota, v);
      if (temMono) notasMonofasico++;
    }

    const clientes = [...porCliente.entries()].map(([id, c]) => ({ companyId: id, ...c, valor: Math.round(c.valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor);

    return {
      totalNotas, totalValor: Math.round(totalValor * 100) / 100,
      clientes: clientes.length,
      docsAtivos, docsInativos,
      empresasAtivas: companies.filter((c) => c.active).length,
      empresasInativas: companies.filter((c) => !c.active).length,
      fiscal: {
        porTipoDoc: arr(porTipoDoc),
        porDirecao: arr(porDirecao),       // entrada x saída
        porAmbito: arr(porAmbito),         // interna x interestadual x exterior
        porTributacao: arr(porTributacao), // tributado / ST / isento / simples
        monofasico: { notas: notasMonofasico, grupos: arr(monofasico) },
      },
      contabil: {
        // contábil: saídas = receita; entradas = custos/compras
        receitaVsCusto: arr(porDirecao).map((x) => ({ ...x, natureza: x.chave === 'saida' ? 'Receita (vendas)' : x.chave === 'entrada' ? 'Custo/Compra' : 'Indefinido' })),
        porSegmento: arr(porSegmento),
        porRegime: arr(porRegime),
      },
      periodo: { porMes: arr(porMes).sort((a, b) => a.chave.localeCompare(b.chave)) },
      topNcms: arr(porNcm).slice(0, 20),
      topClientes: clientes.slice(0, 30),
    };
  }
}
