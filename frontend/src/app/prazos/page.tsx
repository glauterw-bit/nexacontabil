'use client';
import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, Loader2, AlertTriangle } from 'lucide-react';
import { tint } from '@/components/ui/kit';

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

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}><Loader2 size={32} className="animate-spin" /></div>;
  const hoje = new Date().toISOString().slice(0, 10);
  const maxTotal = Math.max(1, ...(data?.timeline ?? []).map((d: any) => d.tipos.reduce((s: number, t: any) => s + t.total, 0)));

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <CalendarClock size={24} color="var(--acao)" /> Mapa de Prazos & SLA
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>Todas as obrigações da carteira na linha do tempo, com alerta de atraso.</p>

      <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
        <Stat label="Obrigações" value={data?.total} cor="var(--tx-strong)" />
        <Stat label="Atrasadas" value={data?.atrasadas} cor="var(--erro)" />
        <Stat label="Vencem em 7 dias" value={data?.proximas7dias} cor="var(--atencao)" />
        <Stat label="Entregues" value={data?.entregues} cor="var(--ok)" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 12 }}>Linha do tempo</h2>
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

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 12 }}>Por tipo</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(data?.porTipo ?? []).map((t: any) => (
          <div key={t.type} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontWeight: 600 }}>{t.type}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.total} total{t.atrasadas ? ` · ${t.atrasadas} atrasadas` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  );
}
