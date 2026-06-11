'use client';
import { useEffect, useState, useCallback } from 'react';
import { Users, Loader2, Info } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function ProdutividadePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/produtividade`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}><Loader2 size={32} className="animate-spin" /></div>;
  const maxDocs = Math.max(1, ...(data?.equipe ?? []).map((e: any) => e.docs));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={24} color="#6366f1" /> Produtividade da Equipe
      </h1>
      <p style={{ color: '#94a3b8', marginTop: 4 }}>Carteira, volume de documentos e erros pescados por responsável.</p>

      {data?.precisaAtribuir && (
        <div style={{ display: 'flex', gap: 10, padding: 14, background: '#161b27', border: '1px solid #3a3215', borderRadius: 10, marginTop: 18, color: '#fcd34d', fontSize: 13 }}>
          <Info size={18} />
          <div><strong>{data.semResponsavel} clientes sem responsável atribuído.</strong> Atribua um responsável a cada cliente (na Carteira / Empresas) para que os números por analista fiquem precisos.</div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', fontSize: 11, color: '#64748b', padding: '0 16px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <div style={{ flex: 1 }}>Responsável</div>
          <div style={{ width: 90, textAlign: 'right' }}>Clientes</div>
          <div style={{ width: 200 }}>Documentos</div>
          <div style={{ width: 80, textAlign: 'right' }}>Erros</div>
        </div>
        {(data?.equipe ?? []).map((e: any, i: number) => {
          const semResp = e.responsavel.includes('Sem responsável');
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', background: '#161b27', border: '1px solid #2a3142', borderRadius: 10, padding: '12px 16px', marginBottom: 8, opacity: semResp ? 0.65 : 1 }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: semResp ? '#64748b' : '#e2e8f0' }}>{e.responsavel}</div>
              <div style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{e.clientesAtivos}<span style={{ color: '#64748b' }}>/{e.clientes}</span></div>
              <div style={{ width: 200, paddingLeft: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 18, width: `${(e.docs / maxDocs) * 100}%`, minWidth: 4, background: '#6366f1', borderRadius: 4 }} />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{e.docs.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div style={{ width: 80, textAlign: 'right', color: e.erros ? '#f59e0b' : '#64748b', fontWeight: 600 }}>{e.erros}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
