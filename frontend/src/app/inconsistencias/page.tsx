'use client';
import { useEffect, useState, useCallback } from 'react';
import { FileWarning, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

export default function InconsistenciasPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ranking' | 'notas'>('ranking');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/inconsistencias`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}><Loader2 size={32} className="animate-spin" /></div>;

  return (
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileWarning size={24} color="var(--atencao)" /> Central de Inconsistências
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>Malha fina: os erros fiscais reais, priorizados por valor envolvido.</p>

      <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
        <Stat label="Notas com erro" value={data?.totalNotas} cor="var(--atencao)" />
        <Stat label="Erros (total)" value={data?.totalErros} cor="var(--erro)" />
        <Stat label="Clientes afetados" value={data?.clientesAfetados} cor="var(--acao)" />
        <Stat label="Valor envolvido" value={BRL(data?.valorEnvolvido)} cor="var(--tx-strong)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 12 }}>
        <Tab on={tab === 'ranking'} onClick={() => setTab('ranking')}>Ranking por cliente</Tab>
        <Tab on={tab === 'notas'} onClick={() => setTab('notas')}>Notas (por valor)</Tab>
      </div>

      {tab === 'ranking' && (data?.ranking ?? []).map((c: any, i: number) => (
        <Link key={i} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 8, cursor: 'pointer' }}>
            <span style={{ width: 24, color: 'var(--faint)', fontWeight: 700 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.responsavel ?? 'sem responsável'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--erro)', fontWeight: 700 }}>{c.erros} erros</div>
              <div style={{ fontSize: 12, color: 'var(--faint)' }}>{BRL(c.valor)}</div>
            </div>
            <ChevronRight size={16} color="var(--acao)" />
          </div>
        </Link>
      ))}

      {tab === 'notas' && (data?.itens ?? []).map((it: any, i: number) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div><strong>{it.cliente}</strong> <span style={{ fontSize: 12, color: 'var(--faint)' }}>NF {it.nota} · {dataBR(it.data)}</span></div>
            <strong>{BRL(it.valor)}</strong>
          </div>
          {it.problemas.map((p: string, j: number) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--atencao)', marginTop: 6 }}>
              <AlertTriangle size={13} /> {p}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  );
}
function Tab({ on, onClick, children }: any) {
  return <button onClick={onClick} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: on ? 'var(--acao)' : 'var(--surface2)', color: on ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{children}</button>;
}
