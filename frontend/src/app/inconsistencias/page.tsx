'use client';
import { useEffect, useState, useCallback } from 'react';
import { FileWarning, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, COLORS, Kpi, Card, Spinner } from '@/components/ui/kit';

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

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <PageHeader
        icon={<FileWarning size={22} color={COLORS.acao} />}
        title="Central de Inconsistências"
        subtitle="Malha fina: os erros fiscais reais, priorizados por valor envolvido."
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Notas com erro" value={data?.totalNotas ?? 0} cor="var(--atencao)" />
        <Kpi label="Erros (total)" value={data?.totalErros ?? 0} cor="var(--erro)" />
        <Kpi label="Clientes afetados" value={data?.clientesAfetados ?? 0} cor="var(--tx-strong)" />
        <Kpi label="Valor envolvido" value={BRL(data?.valorEnvolvido)} cor="var(--tx-strong)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 12 }}>
        <Tab on={tab === 'ranking'} onClick={() => setTab('ranking')}>Ranking por cliente</Tab>
        <Tab on={tab === 'notas'} onClick={() => setTab('notas')}>Notas (por valor)</Tab>
      </div>

      {tab === 'ranking' && (data?.ranking ?? []).map((c: any, i: number) => (
        <Link key={i} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <Card style={{ marginBottom: 8, padding: '12px 16px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 24, color: 'var(--faint)', fontWeight: 700 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.responsavel ?? 'sem responsável'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ color: 'var(--erro)', fontWeight: 700 }}>{c.erros} erros</div>
                <div className="num" style={{ fontSize: 12, color: 'var(--faint)' }}>{BRL(c.valor)}</div>
              </div>
              <ChevronRight size={16} color="var(--acao)" />
            </div>
          </Card>
        </Link>
      ))}

      {tab === 'notas' && (data?.itens ?? []).map((it: any, i: number) => (
        <Card key={i} style={{ marginBottom: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div><strong>{it.cliente}</strong> <span style={{ fontSize: 12, color: 'var(--faint)' }}>NF {it.nota} · {dataBR(it.data)}</span></div>
            <strong>{BRL(it.valor)}</strong>
          </div>
          {it.problemas.map((p: string, j: number) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--atencao)', marginTop: 6 }}>
              <AlertTriangle size={13} /> {p}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

function Tab({ on, onClick, children }: any) {
  return <button onClick={onClick} className={on ? 'btn-primary' : 'btn-secondary'}>{children}</button>;
}
