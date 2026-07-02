'use client';
import { useEffect, useState, useCallback } from 'react';
import { Users, Loader2, Info, Lightbulb } from 'lucide-react';
import { tint } from '@/components/ui/kit';
import Link from 'next/link';

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

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}><Loader2 size={32} className="animate-spin" /></div>;
  const maxDocs = Math.max(1, ...(data?.equipe ?? []).map((e: any) => e.docs));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={24} color="var(--acao)" /> Produtividade da Equipe
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>Carteira, volume de documentos e erros pescados por responsável.</p>

      {data?.precisaAtribuir && (
        <div style={{ display: 'flex', gap: 10, padding: 14, background: 'var(--surface)', border: `1px solid ${tint('var(--atencao)', 30)}`, borderRadius: 10, marginTop: 18, color: 'var(--atencao)', fontSize: 13 }}>
          <Info size={18} />
          <div style={{ flex: 1 }}><strong>{data.semResponsavel} clientes sem responsável atribuído.</strong> Atribua um responsável a cada cliente para que os números por analista fiquem precisos.</div>
          <Link href="/atribuir-responsavel" style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--atencao)', color: '#3a2806', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>Atribuir agora →</Link>
        </div>
      )}

      {/* insights de gestão */}
      {data?.insights?.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.insights.map((ins: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 12, background: tint('var(--acao)', 8), border: `1px solid ${tint('var(--acao)', 30)}`, borderRadius: 10, fontSize: 13, color: 'var(--acao)' }}>
              <Lightbulb size={18} color="var(--acao)" /> {ins.texto}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', fontSize: 11, color: 'var(--faint)', padding: '0 16px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <div style={{ flex: 1 }}>Responsável</div>
          <div style={{ width: 90, textAlign: 'right' }}>Clientes</div>
          <div style={{ width: 180 }}>Documentos</div>
          <div style={{ width: 70, textAlign: 'right' }}>Docs/cli</div>
          <div style={{ width: 90, textAlign: 'right' }}>Erros</div>
          <div style={{ width: 80, textAlign: 'right' }}>Taxa erro</div>
        </div>
        {(data?.equipe ?? []).map((e: any, i: number) => {
          const semResp = e.responsavel.includes('Sem responsável');
          const taxaCor = e.taxaErro > 2 ? 'var(--erro)' : e.taxaErro > 1 ? 'var(--atencao)' : 'var(--ok)';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 8, opacity: semResp ? 0.65 : 1 }}>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: semResp ? 'var(--faint)' : 'var(--tx)' }}>{e.responsavel}</div>
              <div style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{e.clientesAtivos}<span style={{ color: 'var(--faint)' }}>/{e.clientes}</span></div>
              <div style={{ width: 180, paddingLeft: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ height: 18, width: `${(e.docs / maxDocs) * 100}%`, minWidth: 4, background: 'var(--acao)', borderRadius: 4 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{e.docs.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div style={{ width: 70, textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>{e.docsPorCliente}</div>
              <div style={{ width: 90, textAlign: 'right', color: e.erros ? 'var(--atencao)' : 'var(--faint)', fontWeight: 600 }}>{e.erros}</div>
              <div style={{ width: 80, textAlign: 'right', color: semResp ? 'var(--faint)' : taxaCor, fontWeight: 600, fontSize: 13 }}>{e.taxaErro}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
