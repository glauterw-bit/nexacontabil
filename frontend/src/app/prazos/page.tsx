'use client';
import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import { tint, PageHeader, COLORS, Kpi, Card, SectionTitle, Spinner } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const diaBR = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function PrazosPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/prazos`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  const hoje = new Date().toISOString().slice(0, 10);
  const maxTotal = Math.max(1, ...(data?.timeline ?? []).map((d: any) => d.tipos.reduce((s: number, t: any) => s + t.total, 0)));

  return (
    <div className="page">
      <PageHeader
        icon={<CalendarClock size={22} color={COLORS.acao} />}
        title="Mapa de Prazos & SLA"
        subtitle="Todas as obrigações da carteira na linha do tempo, com alerta de atraso."
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Obrigações" value={data?.total ?? 0} cor="var(--tx-strong)" />
        <Kpi label="Atrasadas" value={data?.atrasadas ?? 0} cor="var(--erro)" />
        <Kpi label="Vencem em 7 dias" value={data?.proximas7dias ?? 0} cor="var(--atencao)" />
        <Kpi label="Entregues" value={data?.entregues ?? 0} cor="var(--ok)" />
      </div>

      <SectionTitle>Linha do tempo</SectionTitle>
      {(data?.timeline ?? []).map((d: any) => {
        const total = d.tipos.reduce((s: number, t: any) => s + t.total, 0);
        const atras = d.tipos.reduce((s: number, t: any) => s + t.atrasadas, 0);
        const isHoje = d.data === hoje;
        return (
          <div key={d.data} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ width: 110, fontSize: 13, color: isHoje ? 'var(--acao)' : 'var(--muted)', fontWeight: isHoje ? 700 : 400 }}>
              {diaBR(d.data)}{isHoje ? ' • hoje' : ''}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ height: 22, width: `${(total / maxTotal) * 100}%`, minWidth: 40, background: atras ? tint('var(--erro)', 20) : tint('var(--acao)', 20), border: `1px solid ${atras ? 'var(--erro)' : 'var(--acao)'}`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 11, color: 'var(--tx)' }}>
                {total}
              </div>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>{d.tipos.map((t: any) => t.type).join(' · ')}</span>
              {atras > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--erro)' }}><AlertTriangle size={12} /> {atras}</span>}
            </div>
          </div>
        );
      })}

      <SectionTitle>Por tipo</SectionTitle>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(data?.porTipo ?? []).map((t: any) => (
          <Card key={t.type} style={{ padding: '10px 14px' }}>
            <div style={{ fontWeight: 600 }}>{t.type}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.total} total{t.atrasadas ? ` · ${t.atrasadas} atrasadas` : ''}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
