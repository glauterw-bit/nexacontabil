'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FileWarning, ArrowLeft, Wrench, AlertTriangle, HeartPulse } from 'lucide-react';
import { tint, Dot, PageHeader, COLORS, Kpi, SectionTitle, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const sevCor = (s: string) => s === 'alta' ? 'var(--erro)' : s === 'media' ? 'var(--atencao)' : 'var(--faint)';

function Conteudo() {
  const params = useSearchParams();
  const companyId = params.get('companyId') ?? '';
  const [data, setData] = useState<any>(null);
  const [saude, setSaude] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}/api/v1/paineis/cliente-erros?companyId=${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}).finally(() => setLoading(false));
    fetch(`${API}/api/v1/health-score?companyId=${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setSaude).catch(() => {});
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

  if (loading) return <Spinner />;
  if (!data?.empresa) return <EmptyState icon={<FileWarning size={32} />} title="Cliente não informado ou sem erros." />;

  return (
    <div className="page-narrow">
      <Link href="/meu-dia" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 13, textDecoration: 'none', marginBottom: 12 }}>
        <ArrowLeft size={15} /> Voltar
      </Link>
      <PageHeader
        icon={<FileWarning size={22} color={COLORS.acao} />}
        title={`Erros fiscais — ${data.empresa.name}`}
        subtitle={`${data.empresa.taxRegime} · responsável: ${data.empresa.responsavel ?? '—'}`}
      />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Notas com erro" value={data.totalNotas ?? 0} cor="var(--atencao)" />
        <Kpi label="Erros (total)" value={data.totalErros ?? 0} cor="var(--erro)" />
        <Kpi label="Valor envolvido" value={BRL(data.valorEnvolvido)} cor="var(--tx-strong)" />
      </div>

      {/* Saúde do cliente — 6 dimensões calculadas do dado real */}
      {saude?.dimensoes?.length > 0 && <SaudeCliente s={saude} />}

      {/* resumo por tipo */}
      {data.resumoPorTipo?.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.resumoPorTipo.map((t: any) => (
            <span key={t.categoria} style={{ padding: '6px 12px', borderRadius: 20, background: tint('var(--atencao)', 10), border: `1px solid ${tint('var(--atencao)', 30)}`, color: 'var(--atencao)', fontSize: 12 }}>
              {t.categoria}: <strong>{t.qtd}</strong>
            </span>
          ))}
        </div>
      )}

      <SectionTitle>Notas e como corrigir</SectionTitle>
      {data.notas.map((n: any) => (
        <div key={n.docId} className="card-aura" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div><strong>NF {n.nota ?? '—'}</strong> <span style={{ fontSize: 12, color: 'var(--faint)' }}>· {dataBR(n.data)}</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong>{BRL(n.valor)}</strong>
              <button onClick={() => baixar(n.docId, n.arquivo)} disabled={baixando === n.docId} className="btn-secondary">
                {baixando === n.docId ? '...' : 'XML'}
              </button>
            </div>
          </div>
          {n.problemas.map((p: any, i: number) => (
            <div key={i} style={{ borderLeft: `3px solid ${sevCor(p.severidade)}`, paddingLeft: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: sevCor(p.severidade) }}>
                <AlertTriangle size={14} /> {p.categoria}
              </div>
              {p.oQueE && <div style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0', fontStyle: 'italic' }}>{p.oQueE}</div>}
              <div style={{ fontSize: 13, color: 'var(--tx)', margin: '4px 0' }}>{p.causa}</div>
              {p.emMiudos && (
                <div style={{ background: tint('var(--acao)', 8), borderLeft: '3px solid var(--acao)', borderRadius: 6, padding: '8px 12px', margin: '6px 0' }}>
                  <div style={{ fontSize: 11, color: 'var(--acao)', fontWeight: 600, marginBottom: 3 }}>EM MIÚDOS (explicação simples)</div>
                  <div style={{ fontSize: 13, color: 'var(--tx)', lineHeight: 1.6 }}>{p.emMiudos}</div>
                </div>
              )}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok)', fontWeight: 600, marginBottom: 4 }}>
                  <Wrench size={13} /> Como corrigir
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--tx)', lineHeight: 1.6 }}>
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

const scoreCor = (s: number) => s >= 75 ? 'var(--ok)' : s >= 50 ? 'var(--atencao)' : 'var(--erro)';
const scoreDot = (s: number) => s >= 75 ? 'var(--dot-ok)' : s >= 50 ? 'var(--dot-atencao)' : 'var(--dot-erro)';

function SaudeCliente({ s }: { s: any }) {
  return (
    <div className="card-aura" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HeartPulse size={18} color={scoreCor(s.scoreGeral)} />
          <span className="num" style={{ fontSize: 30, fontWeight: 800, color: scoreCor(s.scoreGeral), letterSpacing: '-0.02em' }}>{s.scoreGeral}</span>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>/100<br />saúde geral</span>
        </div>
        <div style={{ flex: 1, minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px 16px' }}>
          {s.dimensoes.map((d: any) => (
            <div key={d.nome} title={d.alertas?.join(' · ') || undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome}</span>
                <strong className="num" style={{ color: scoreCor(d.score) }}>{d.score}</strong>
              </div>
              <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${d.score}%`, height: '100%', background: scoreDot(d.score) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {s.alertas?.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {s.alertas.slice(0, 4).map((a: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: a.prioridade === 'alta' ? 'var(--erro)' : a.prioridade === 'media' ? 'var(--atencao)' : 'var(--muted)' }}>
              <Dot cor={a.prioridade === 'alta' ? 'var(--dot-erro)' : a.prioridade === 'media' ? 'var(--dot-atencao)' : 'var(--faint)'} size={6} />
              {a.msg} <span style={{ color: 'var(--faint)' }}>· {a.dimensao}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClienteErrosPage() {
  return <Suspense fallback={<Spinner />}><Conteudo /></Suspense>;
}
