'use client';
import { useState } from 'react';
import { Search, Loader2, FileText, AlertTriangle, Sparkles } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const EXEMPLOS = [
  'Notas da Laser Tech de junho de 2025',
  'NF-e acima de 5000 reais',
  'Documentos com inconsistência de ICMS',
  'Notas de maio com NCM 85044010',
];

export default function BuscarDocsPage() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function buscar(q?: string) {
    const consulta = q ?? query;
    if (!consulta.trim()) return;
    if (q) setQuery(q);
    setLoading(true); setData(null);
    try {
      const r = await fetch(`${API}/api/v1/busca-docs`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: consulta }),
      });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={24} color="#6366f1" /> Buscar Documentos
      </h1>
      <p style={{ color: '#94a3b8', marginTop: 4 }}>
        Peça em linguagem natural. A IA interpreta e traz os arquivos <strong>+ a análise fiscal</strong>.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#64748b' }} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Ex: NF da Laser Tech de junho acima de 1000 reais"
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, border: '1px solid #2a3142', background: '#161b27', color: '#e2e8f0', fontSize: 15 }}
          />
        </div>
        <button onClick={() => buscar()} disabled={loading}
          style={{ padding: '0 22px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Buscar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {EXEMPLOS.map((ex) => (
          <button key={ex} onClick={() => buscar(ex)}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid #2a3142', background: '#10141d', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            {ex}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={28} className="animate-spin" /></div>}

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Card label="Encontrados" value={`${data.encontrados}`} sub={data.totalDisponivel > data.encontrados ? `de ${data.totalDisponivel}+` : undefined} />
            <Card label="Valor total" value={BRL(data.valorTotal)} />
            <Card label="Com inconsistência" value={`${data.comInconsistencia}`} cor={data.comInconsistencia ? '#f59e0b' : '#10b981'} />
          </div>

          {data.encontrados === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', border: '1px dashed #2a3142', borderRadius: 10 }}>
              Nenhum documento encontrado para essa busca.
            </div>
          )}

          {data.resultados.map((r: any) => (
            <div key={r.id} style={{ background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} color="#6366f1" />
                    <strong>{r.emitente || r.arquivo}</strong>
                    <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{r.tipo} {r.numero ? `#${r.numero}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                    {r.cliente} · {dataBR(r.data)}
                    {r.ncms?.length ? ` · NCM ${r.ncms.join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{BRL(r.valor)}</div>
                  {r.impostos && <div style={{ fontSize: 11, color: '#64748b' }}>ICMS {BRL(r.impostos.icms)}</div>}
                </div>
              </div>
              {r.inconsistencias?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: '#1f1a10', borderRadius: 8, border: '1px solid #3a2f15' }}>
                  {r.inconsistencias.map((inc: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b' }}>
                      <AlertTriangle size={13} /> {inc}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, cor, sub }: { label: string; value: string; cor?: string; sub?: string }) {
  return (
    <div style={{ flex: 1, background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || '#e2e8f0', marginTop: 4 }}>
        {value} {sub && <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>{sub}</span>}
      </div>
    </div>
  );
}
