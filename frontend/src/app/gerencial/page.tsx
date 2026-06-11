'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Loader2, AlertTriangle, Lightbulb, ChevronRight, Headset } from 'lucide-react';
import { PageHeader, Kpi, Hero, Card, SectionTitle, Bar, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function GerencialPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/gerencial`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}><Loader2 size={32} className="animate-spin" /></div>;
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: COLORS.faint }}>Sem dados.</div>;

  const k = d.kpis ?? {}; const h = d.hero ?? {};
  const maxDocs = Math.max(1, ...(d.equipe ?? []).map((e: any) => e.docs));
  const saudeCor = (taxa: number) => taxa > 2 ? COLORS.erro : taxa > 1 ? COLORS.atencao : COLORS.ok;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<LayoutDashboard size={24} color={COLORS.acao} />} title="Painel Gerencial" subtitle="Visão do escritório em tempo real — onde agir agora." />

      {/* herói + KPIs */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 320px' }}>
          <Link href="/prazos" style={{ textDecoration: 'none' }}>
            <Hero value={h.emRisco ?? 0} label={`obrigações em risco (${h.atrasadas} atrasadas · ${h.proximas7dias} vencem em 7 dias)`} cor={h.emRisco > 0 ? COLORS.atencao : COLORS.ok} icon={<AlertTriangle size={40} />} />
          </Link>
        </div>
        <div style={{ flex: '2 1 480px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="Documentos" value={(k.docs ?? 0).toLocaleString('pt-BR')} sub={`${k.clientes} clientes`} />
          <Kpi label="Notas com erro" value={k.notasErro ?? 0} cor={COLORS.atencao} sub={`${k.clientesComErro} clientes`} />
          <Kpi label="Valor em risco" value={BRL(k.valorEnvolvido)} cor={COLORS.erro} />
          <Kpi label="Atendimentos abertos" value={k.atendAbertos ?? 0} cor={COLORS.acao} />
        </div>
      </div>

      {/* insights */}
      {d.insights?.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.insights.map((ins: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 12, background: '#13182a', border: '1px solid #2a2f55', borderRadius: 10, fontSize: 13, color: '#c7d2fe' }}>
              <Lightbulb size={18} color="#818cf8" /> {ins.texto}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
        {/* saúde da equipe */}
        <div style={{ flex: '1 1 420px' }}>
          <SectionTitle>Saúde da equipe</SectionTitle>
          {(d.equipe ?? []).map((e: any, i: number) => (
            <Card key={i} accent={saudeCor(e.taxaErro)} style={{ marginBottom: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.responsavel}</div>
                  <div style={{ marginTop: 6 }}><Bar frac={e.docs / maxDocs} h={6} /></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: COLORS.muted }}>
                  <div>{e.clientesAtivos} clientes · {e.docs.toLocaleString('pt-BR')} docs</div>
                  <div style={{ color: saudeCor(e.taxaErro), fontWeight: 600 }}>{e.taxaErro}% erro</div>
                </div>
              </div>
            </Card>
          ))}
          <Link href="/produtividade" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 13, color: COLORS.acao, textDecoration: 'none', marginTop: 4 }}>
            ver produtividade completa <ChevronRight size={14} />
          </Link>
        </div>

        {/* top clientes com erro */}
        <div style={{ flex: '1 1 420px' }}>
          <SectionTitle>Clientes que mais precisam de atenção</SectionTitle>
          {(d.topClientesErro ?? []).map((c: any, i: number) => (
            <Link key={i} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card style={{ marginBottom: 8, padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 20, color: COLORS.faint, fontWeight: 700 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>{c.responsavel ?? 'sem responsável'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: COLORS.erro, fontWeight: 700 }}>{c.erros} erros</div>
                    <div style={{ fontSize: 12, color: COLORS.faint }}>{BRL(c.valor)}</div>
                  </div>
                  <ChevronRight size={16} color={COLORS.acao} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* atalhos */}
      <SectionTitle>Acessos rápidos</SectionTitle>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { href: '/inconsistencias', label: 'Central de Inconsistências' },
          { href: '/atendimentos', label: 'Central de Atendimento' },
          { href: '/prazos', label: 'Mapa de Prazos & SLA' },
          { href: '/visao-geral', label: 'Todos os Clientes' },
          { href: '/atribuir-responsavel', label: 'Atribuir Responsáveis' },
        ].map((a) => (
          <Link key={a.href} href={a.href} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontSize: 13, textDecoration: 'none' }}>{a.label}</Link>
        ))}
      </div>
    </div>
  );
}
