'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderTree, Loader2, ArrowDownUp, MapPin, Receipt, Boxes, Calendar, Building2, ChevronRight } from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, Bar, COLORS, tint } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const LBL: Record<string, string> = {
  entrada: 'Entradas (compras)', saida: 'Saídas (vendas)', indef: 'Indefinido',
  interna: 'Interna (mesmo estado)', interestadual: 'Interestadual', exterior: 'Exterior',
  tributado: 'Tributado', st: 'Substituição Tributária', isento: 'Isento/Não-trib.', simples: 'Simples Nacional',
};
const CORS: Record<string, string> = {
  saida: COLORS.ok, entrada: COLORS.info, indef: COLORS.faint,
  tributado: COLORS.acao, st: COLORS.atencao, isento: COLORS.faint, simples: COLORS.info,
};

export default function OrganizacaoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/organizacao/overview`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}><Loader2 size={32} className="animate-spin" /></div>;
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: COLORS.faint }}>Sem dados.</div>;

  const Distrib = ({ titulo, icon, dados }: { titulo: string; icon: any; dados: any[] }) => {
    const max = Math.max(1, ...dados.map((x: any) => x.valor));
    return (
      <Card style={{ flex: '1 1 320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 10 }}>{icon} {titulo}</div>
        {dados.map((x: any) => (
          <div key={x.chave} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
              <span>{LBL[x.chave] ?? x.chave}</span>
              <span style={{ color: COLORS.muted }}>{BRL(x.valor)} · {x.qtd}</span>
            </div>
            <Bar frac={x.valor / max} cor={CORS[x.chave] ?? COLORS.acao} h={6} />
          </div>
        ))}
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<FolderTree size={24} color={COLORS.acao} />} title="Organização Documental"
        subtitle="Todos os documentos organizados por natureza fiscal, contábil e cliente." />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Documentos" value={d.totalNotas?.toLocaleString('pt-BR')} sub={`${d.docsAtivos} ativos · ${d.docsInativos} históricos`} />
        <Kpi label="Valor total" value={BRL(d.totalValor)} />
        <Kpi label="Clientes" value={d.clientes} sub={`${d.empresasAtivas} ativos · ${d.empresasInativas} inativos`} />
        <Kpi label="Notas monofásicas" value={d.fiscal?.monofasico?.notas ?? 0} cor={COLORS.atencao} />
      </div>

      <SectionTitle>Natureza fiscal</SectionTitle>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Distrib titulo="Entrada × Saída" icon={<ArrowDownUp size={16} color={COLORS.acao} />} dados={d.fiscal.porDirecao} />
        <Distrib titulo="Âmbito (UF)" icon={<MapPin size={16} color={COLORS.acao} />} dados={d.fiscal.porAmbito} />
        <Distrib titulo="Tributação" icon={<Receipt size={16} color={COLORS.acao} />} dados={d.fiscal.porTributacao} />
      </div>

      {d.fiscal.monofasico?.grupos?.length > 0 && (
        <>
          <SectionTitle>Monofásico (PIS/COFINS já tributado na origem)</SectionTitle>
          <Card>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>Produtos onde o PIS/COFINS deve ser zerado na revenda — atenção a recolhimento a maior.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.fiscal.monofasico.grupos.map((g: any) => (
                <span key={g.chave} style={{ padding: '6px 12px', borderRadius: 20, background: tint(COLORS.atencao, 9), border: `1px solid ${tint(COLORS.atencao, 33)}`, color: COLORS.atencao, fontSize: 12 }}>
                  {g.chave}: {BRL(g.valor)} ({g.qtd})
                </span>
              ))}
            </div>
          </Card>
        </>
      )}

      <SectionTitle>Natureza contábil</SectionTitle>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Card style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 10 }}><Receipt size={16} color={COLORS.ok} /> Receita × Custo</div>
          {d.contabil.receitaVsCusto.filter((x: any) => x.chave !== 'indef').map((x: any) => (
            <div key={x.chave} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>{x.natureza}</span><strong style={{ color: x.chave === 'saida' ? COLORS.ok : COLORS.info }}>{BRL(x.valor)}</strong>
            </div>
          ))}
        </Card>
        <Distrib titulo="Por segmento" icon={<Boxes size={16} color={COLORS.acao} />} dados={d.contabil.porSegmento} />
        <Distrib titulo="Por regime" icon={<Building2 size={16} color={COLORS.acao} />} dados={d.contabil.porRegime} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 460px' }}>
          <SectionTitle>Top clientes por movimento</SectionTitle>
          {d.topClientes.slice(0, 12).map((c: any, i: number) => (
            <Link key={c.companyId} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card style={{ marginBottom: 6, padding: '10px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 18, color: COLORS.faint, fontWeight: 700 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{c.regime} · {c.qtd} docs · {c.saidas}↑ {c.entradas}↓</div>
                  </div>
                  <strong style={{ fontSize: 13 }}>{BRL(c.valor)}</strong>
                  <ChevronRight size={15} color={COLORS.acao} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <div style={{ flex: '1 1 460px' }}>
          <SectionTitle>Top NCMs</SectionTitle>
          {d.topNcms.slice(0, 12).map((n: any, i: number) => (
            <Card key={n.chave} style={{ marginBottom: 6, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, color: COLORS.faint, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>NCM {n.chave}</span>
                <span style={{ fontSize: 12, color: COLORS.muted }}>{n.qtd} itens</span>
                <strong style={{ fontSize: 13 }}>{BRL(n.valor)}</strong>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <SectionTitle>Movimento por mês</SectionTitle>
      <Card>
        {(() => {
          const max = Math.max(1, ...d.periodo.porMes.map((m: any) => m.valor));
          return d.periodo.porMes.map((m: any) => (
            <div key={m.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 70, fontSize: 12, color: COLORS.muted }}>{m.chave}</span>
              <div style={{ flex: 1 }}><Bar frac={m.valor / max} h={14} /></div>
              <span style={{ width: 110, textAlign: 'right', fontSize: 12 }}>{BRL(m.valor)}</span>
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}
