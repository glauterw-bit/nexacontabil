'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileWarning, Loader2, ArrowLeft, Wrench, AlertTriangle, Lightbulb } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const sevCor = (s: string) => s === 'alta' ? '#ef4444' : s === 'media' ? '#f59e0b' : '#64748b';

function Conteudo() {
  const params = useSearchParams();
  const companyId = params.get('companyId') ?? '';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}/api/v1/paineis/cliente-erros?companyId=${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);

  async function baixar(id: string, nome: string) {
    setBaixando(id);
    try {
      const r = await fetch(`${API}/api/v1/busca-docs/download/${id}`, { headers: authHeaders() });
      if (!r.ok) { alert('Não foi possível baixar.'); return; }
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nome || 'documento.xml';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch {} finally { setBaixando(null); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}><Loader2 size={32} className="animate-spin" /></div>;
  if (!data?.empresa) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Cliente não informado ou sem erros.</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <Link href="/meu-dia" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 13, textDecoration: 'none', marginBottom: 12 }}>
        <ArrowLeft size={15} /> Voltar
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileWarning size={22} color="#f59e0b" /> Erros fiscais — {data.empresa.name}
      </h1>
      <p style={{ color: '#94a3b8', marginTop: 4 }}>
        {data.empresa.taxRegime} · responsável: {data.empresa.responsavel ?? '—'}
      </p>

      <div style={{ display: 'flex', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
        <Stat label="Notas com erro" value={data.totalNotas} cor="#f59e0b" />
        <Stat label="Erros (total)" value={data.totalErros} cor="#ef4444" />
        <Stat label="Valor envolvido" value={BRL(data.valorEnvolvido)} cor="#e2e8f0" />
      </div>

      {/* resumo por tipo */}
      {data.resumoPorTipo?.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.resumoPorTipo.map((t: any) => (
            <span key={t.categoria} style={{ padding: '6px 12px', borderRadius: 20, background: '#1f1a10', border: '1px solid #3a2f15', color: '#fbbf24', fontSize: 12 }}>
              {t.categoria}: <strong>{t.qtd}</strong>
            </span>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 26, marginBottom: 12 }}>Notas e como corrigir</h2>
      {data.notas.map((n: any) => (
        <div key={n.docId} style={{ background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div><strong>NF {n.nota ?? '—'}</strong> <span style={{ fontSize: 12, color: '#64748b' }}>· {dataBR(n.data)}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong>{BRL(n.valor)}</strong>
              <button onClick={() => baixar(n.docId, n.arquivo)} disabled={baixando === n.docId}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #2a3142', background: '#10141d', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                {baixando === n.docId ? '...' : 'XML'}
              </button>
            </div>
          </div>
          {n.problemas.map((p: any, i: number) => (
            <div key={i} style={{ borderLeft: `3px solid ${sevCor(p.severidade)}`, paddingLeft: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: sevCor(p.severidade) }}>
                <AlertTriangle size={14} /> {p.categoria}
              </div>
              {p.oQueE && <div style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0', fontStyle: 'italic' }}>{p.oQueE}</div>}
              <div style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0' }}>{p.causa}</div>
              {p.emMiudos && (
                <div style={{ background: '#13182a', borderLeft: '3px solid #6366f1', borderRadius: 6, padding: '8px 12px', margin: '6px 0' }}>
                  <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 600, marginBottom: 3 }}>EM MIÚDOS (explicação simples)</div>
                  <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{p.emMiudos}</div>
                </div>
              )}
              <div style={{ background: '#10141d', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 4 }}>
                  <Wrench size={13} /> Como corrigir
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {p.passos.map((s: string, j: number) => <li key={j}>{s}</li>)}
                </ol>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return (
    <div style={{ flex: '1 1 140px', background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  );
}

export default function ClienteErrosPage() {
  return <Suspense fallback={<div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} className="animate-spin" /></div>}><Conteudo /></Suspense>;
}
