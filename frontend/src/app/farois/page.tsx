'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, Loader2, TrendingDown, Gauge, Percent, PieChart, ChevronRight } from 'lucide-react';
import { PageHeader, Card, SectionTitle, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const sub = (p: number) => p >= 95 ? COLORS.erro : p >= 80 ? COLORS.atencao : COLORS.ok;

export default function FaroisPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/farois`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}><Loader2 size={32} className="animate-spin" /></div>;
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: COLORS.faint }}>Sem dados.</div>;

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<Lightbulb size={24} color={COLORS.atencao} />} title="Faróis — Risco & Oportunidade"
        subtitle="Alertas inteligentes que o gestor precisa ver: o que pode dar problema e onde há dinheiro na mesa." />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* 1. SUBLIMITE SIMPLES */}
        <div style={{ flex: '1 1 520px' }}>
          <SectionTitle><Gauge size={16} style={{ verticalAlign: -2 }} color={COLORS.erro} /> Sublimite do Simples — {d.sublimiteSimples.emRisco} em risco</SectionTitle>
          <Card style={{ padding: 0 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.faint, borderBottom: `1px solid ${COLORS.border}` }}>Teto R$ 4,8 mi/ano. 🟡 acima de 80% · 🔴 acima de 95%.</div>
            {(d.sublimiteSimples.clientes ?? []).filter((c: any) => c.status !== 'verde').slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} cor={sub(c.pctLimite)}
                direita={<><strong style={{ color: sub(c.pctLimite) }}>{c.pctLimite}%</strong><div style={{ fontSize: 11, color: COLORS.faint }}>RBT12 {BRL(c.rbt12)}</div></>} />
            ))}
            {d.sublimiteSimples.emRisco === 0 && <Vazio txt="Nenhum cliente próximo do sublimite ✓" />}
          </Card>
        </div>

        {/* 2. QUEDA DE FATURAMENTO */}
        <div style={{ flex: '1 1 520px' }}>
          <SectionTitle><TrendingDown size={16} style={{ verticalAlign: -2 }} color={COLORS.atencao} /> Queda de faturamento — {d.quedaFaturamento.emQueda} clientes</SectionTitle>
          <Card style={{ padding: 0 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.faint, borderBottom: `1px solid ${COLORS.border}` }}>Último mês caiu 30%+ vs a média recente — sinal de problema/churn.</div>
            {(d.quedaFaturamento.clientes ?? []).slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} cor={COLORS.atencao}
                sub={`${c.ultimaComp}: ${BRL(c.ultimoMes)} (média ${BRL(c.mediaAnterior)})`}
                direita={<strong style={{ color: COLORS.erro }}>−{c.quedaPct}%</strong>} />
            ))}
            {d.quedaFaturamento.emQueda === 0 && <Vazio txt="Nenhuma queda relevante ✓" />}
          </Card>
        </div>

        {/* 3. MONOFÁSICO */}
        <div style={{ flex: '1 1 520px' }}>
          <SectionTitle><Percent size={16} style={{ verticalAlign: -2 }} color={COLORS.ok} /> Monofásico — oportunidade de economia</SectionTitle>
          <Card style={{ padding: 0 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.muted, borderBottom: `1px solid ${COLORS.border}` }}>
              <strong style={{ color: COLORS.ok }}>{BRL(d.monofasico.valorTotal)}</strong> em produtos monofásicos · {d.monofasico.notas} notas · {d.monofasico.clientesAfetados} clientes. PIS/COFINS deve ser 0 na revenda — verificar recolhimento a maior.
            </div>
            {(d.monofasico.clientes ?? []).slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} cor={COLORS.ok}
                direita={<><strong>{BRL(c.valorMono)}</strong><div style={{ fontSize: 11, color: COLORS.faint }}>{c.notasMono} notas</div></>} />
            ))}
          </Card>
        </div>

        {/* 4. CONCENTRAÇÃO */}
        <div style={{ flex: '1 1 520px' }}>
          <SectionTitle><PieChart size={16} style={{ verticalAlign: -2 }} color={COLORS.acao} /> Concentração de receita — risco do escritório</SectionTitle>
          <Card style={{ padding: 0 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, color: COLORS.muted, borderBottom: `1px solid ${COLORS.border}` }}>
              Top 5 clientes = <strong style={{ color: d.concentracao.top5Pct > 40 ? COLORS.atencao : COLORS.text }}>{d.concentracao.top5Pct}%</strong> · Top 10 = <strong>{d.concentracao.top10Pct}%</strong> do faturamento. {d.concentracao.top5Pct > 40 ? 'Alta dependência — diversificar.' : 'Diversificação saudável.'}
            </div>
            {(d.concentracao.topClientes ?? []).slice(0, 8).map((c: any, i: number) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={`${i + 1}. ${c.nome}`} cor={COLORS.acao}
                direita={<><strong>{c.pct}%</strong><div style={{ fontSize: 11, color: COLORS.faint }}>{BRL(c.valor)}</div></>} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Linha({ companyId, nome, sub, cor, direita }: any) {
  return (
    <Link href={`/cliente-erros?companyId=${companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #141925', cursor: 'pointer' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
          {sub && <div style={{ fontSize: 11, color: COLORS.faint }}>{sub}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>{direita}</div>
        <ChevronRight size={14} color={COLORS.faint} />
      </div>
    </Link>
  );
}
function Vazio({ txt }: { txt: string }) {
  return <div style={{ padding: 16, textAlign: 'center', color: COLORS.ok, fontSize: 13 }}>{txt}</div>;
}
