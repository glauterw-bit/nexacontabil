'use client';
import { useEffect, useState, useCallback } from 'react';
import { Sun, Loader2, AlertTriangle, CalendarClock, FileWarning, CheckCircle2, Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

export default function MeuDiaPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analista, setAnalista] = useState('');
  const [nomes, setNomes] = useState<string[]>([]);
  const [ehAnalista, setEhAnalista] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('aura_user') || '{}');
      if (u?.role === 'analista') setEhAnalista(true);
    } catch {}
    fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then((d) => d && setNomes(d.nomes ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = `${API}/api/v1/paineis/meu-dia${analista ? `?responsavel=${encodeURIComponent(analista)}` : ''}`;
      const r = await fetch(u, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, [analista]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}><Loader2 size={32} className="animate-spin" /></div>;
  const r = data?.resumo ?? {};
  const cor = (p: string) => p === 'alta' ? '#ef4444' : p === 'media' ? '#f59e0b' : '#64748b';
  const ico = (t: string) => t === 'obrigacao' ? <CalendarClock size={16} /> : t === 'inconsistencia' ? <FileWarning size={16} /> : <Building2 size={16} />;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sun size={24} color="#f59e0b" /> Meu Dia
      </h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#94a3b8', marginTop: 4 }}>Tudo que precisa de ação agora, priorizado.{ehAnalista && data?.responsavel ? ` (${data.responsavel})` : ''}</p>
        {!ehAnalista && (
          <select value={analista} onChange={(e) => setAnalista(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2a3142', background: '#161b27', color: '#e2e8f0', fontSize: 14 }}>
            <option value="">Toda a carteira</option>
            {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
        <Stat label="Obrigações vencidas" value={r.obrigacoesVencidas} cor="#ef4444" />
        <Stat label="Vencem em 7 dias" value={r.obrigacoesProximas} cor="#f59e0b" />
        <Stat label="Notas com erro" value={r.notasComErro} cor="#f59e0b" />
        <Stat label="Clientes c/ erro" value={r.clientesComErro} cor="#6366f1" />
        <Stat label="Clientes" value={r.clientes} cor="#94a3b8" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 12 }}>A fazer</h2>
      {(!data?.aFazer || data.aFazer.length === 0) && (
        <div style={{ padding: 24, textAlign: 'center', color: '#10b981', border: '1px dashed #1f3a2a', borderRadius: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <CheckCircle2 size={18} /> Tudo em dia! Nenhuma pendência.
        </div>
      )}
      {data?.aFazer?.map((t: any, i: number) => {
        const clicavel = t.tipo === 'inconsistencia' && t.companyId;
        const inner = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#161b27', border: '1px solid #2a3142', borderLeft: `3px solid ${cor(t.prioridade)}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, cursor: clicavel ? 'pointer' : 'default', transition: 'border-color .15s' }}>
            <span style={{ color: cor(t.prioridade) }}>{ico(t.tipo)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t.titulo}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.cliente}</div>
            </div>
            {t.data && <span style={{ fontSize: 12, color: cor(t.prioridade) }}>{dataBR(t.data)}</span>}
            {clicavel && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, color: '#6366f1' }}>como corrigir <ChevronRight size={14} /></span>}
          </div>
        );
        return clicavel
          ? <Link key={i} href={`/cliente-erros?companyId=${t.companyId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link>
          : <div key={i}>{inner}</div>;
      })}
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  );
}
