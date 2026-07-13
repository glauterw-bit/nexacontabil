'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { LayoutDashboard, AlertTriangle, Users, Inbox, ArrowRight } from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, COLORS, tint, Spinner, EmptyState } from '@/components/ui/kit';
import { useCompetencia, fmtCompetencia } from '@/contexts/CompetenciaContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Painel Gerencial — objetivo: como está a carteira e como vai cada analista. */
export default function GerencialPage() {
  const [d, setD] = useState<any>(null);      // /paineis/gerencial (kpis + topClientesErro)
  const [ca, setCa] = useState<any>(null);    // /paineis/carteira-analistas (equipe)
  const [loading, setLoading] = useState(true);
  const { competencia } = useCompetencia();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rg, rc] = await Promise.all([
        fetch(`${API}/api/v1/paineis/gerencial`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/carteira-analistas`, { headers: authHeaders() }),
      ]);
      setD(rg.ok ? await rg.json() : null);
      setCa(rc.ok ? await rc.json() : null);
    } catch {} finally { setLoading(false); }
  }, [competencia]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!d && !ca) return <EmptyState icon={<Inbox size={32} />} title="Sem dados do escritório" sub="Verifique seu login." />;

  const k = d?.kpis ?? {};
  const t = ca?.totais ?? {};
  const analistas: any[] = ca?.analistas ?? [];
  const topErro: any[] = d?.topClientesErro ?? [];

  return (
    <div style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
      <PageHeader
        icon={<LayoutDashboard size={20} color={COLORS.acao} />}
        title="Painel Gerencial"
        subtitle={`Desempenho da equipe e da carteira — ${fmtCompetencia(ca?.competencia)}`}
        action={<Link href="/painel" className="btn-ghost" style={{ fontSize: 13, textDecoration: 'none' }}>Ver Painel do Escritório →</Link>}
      />

      {/* KPIs objetivos do escritório */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <Kpi label="Obrigações vencidas" value={(t.obrigVencidas ?? 0).toLocaleString('pt-BR')} cor={(t.obrigVencidas ?? 0) ? COLORS.erro : COLORS.ok} sub="da carteira toda" />
        <Kpi label="Obrigações pendentes" value={(t.obrigPendentes ?? 0).toLocaleString('pt-BR')} cor={(t.obrigPendentes ?? 0) ? COLORS.atencao : COLORS.ok} sub="a entregar" />
        <Kpi label="Notas com erro" value={(k.notasErro ?? 0).toLocaleString('pt-BR')} cor={(k.notasErro ?? 0) ? COLORS.erro : COLORS.ok} sub={`${k.clientesComErro ?? 0} clientes · ${BRL(k.valorEnvolvido)}`} />
        <Kpi label="Documentos processados" value={(k.docs ?? 0).toLocaleString('pt-BR')} sub={`${t.clientes ?? 0} clientes`} />
        {(t.clientesSemResponsavel ?? 0) > 0 && <Kpi label="Sem responsável" value={t.clientesSemResponsavel} cor={COLORS.info} sub="atribuir analista" />}
      </div>

      {/* Desempenho por analista — o valor único deste painel */}
      <SectionTitle><Users size={15} color={COLORS.acao} /> Desempenho por analista</SectionTitle>
      {analistas.length === 0 ? (
        <EmptyState title="Sem analistas com carteira" sub="Atribua clientes aos analistas em Gestão de Carteira." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
          {analistas.map((a: any) => {
            const atencao = a.clientesAtencao ?? 0;
            const acento = a.obrigVencidas > 0 ? COLORS.erro : atencao > 0 ? COLORS.atencao : COLORS.ok;
            return (
              <Link key={a.responsavel} href={`/painel-analista?responsavel=${encodeURIComponent(a.responsavel)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card accent={acento} style={{ height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: tint(COLORS.acao, 12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, color: COLORS.acao, fontSize: 14 }}>
                      {(a.responsavel || '?').split(' ').map((p: string) => p[0]).slice(0, 2).join('')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.responsavel}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.faint }}>{a.clientes} clientes · {(a.docs ?? 0).toLocaleString('pt-BR')} docs</div>
                    </div>
                    {atencao > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: COLORS.erro, background: tint(COLORS.dotErro, 10), border: `1px solid ${tint(COLORS.dotErro, 25)}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                        <AlertTriangle size={11} /> {atencao}
                      </span>
                    )}
                  </div>
                  <BarraProg label="Entregas" pct={a.pctEntrega} legenda={`${a.obrigEntregues}/${a.obrigTotal}`} />
                  <BarraProg label="Pontualidade" pct={a.pontualidade} legenda={a.obrigVencidas > 0 ? `${a.obrigVencidas} vencida(s)` : 'no prazo'} />
                  <BarraProg label="Precisão" pct={a.precisao} legenda={a.clientesComErro > 0 ? `${a.clientesComErro} c/ erro` : 'sem erro'} />
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Clientes que mais precisam de atenção — lista curta e clara */}
      {topErro.length > 0 && (
        <>
          <SectionTitle><AlertTriangle size={15} color={COLORS.atencao} /> Clientes que mais precisam de atenção</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {topErro.slice(0, 8).map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${COLORS.borderSoft}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: COLORS.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.cliente}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.faint }}>{c.responsavel ?? 'sem responsável'}</div>
                </div>
                <span style={{ color: COLORS.erro, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{c.erros} nota(s) · {BRL(c.valor)}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Link href="/operacao" style={{ fontSize: 13, color: COLORS.acao, textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Carteira detalhada por cliente <ArrowRight size={13} /></Link>
        <Link href="/atribuir-responsavel" style={{ fontSize: 13, color: COLORS.acao, textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Gestão de carteira <ArrowRight size={13} /></Link>
      </div>
    </div>
  );
}

function BarraProg({ label, pct, legenda }: { label: string; pct: number; legenda?: string }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const cor = p >= 90 ? COLORS.ok : p >= 70 ? COLORS.atencao : COLORS.erro;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ color: COLORS.muted }}>{label}</span>
        <span style={{ fontWeight: 700, color: cor, fontVariantNumeric: 'tabular-nums' }}>{p}%{legenda ? <span style={{ color: COLORS.faint, fontWeight: 400 }}> · {legenda}</span> : ''}</span>
      </div>
      <div style={{ height: 7, background: COLORS.surface2, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: cor, transition: 'width .3s' }} />
      </div>
    </div>
  );
}
