'use client';
import { useState } from 'react';
import { Search, Loader2, FileText, AlertTriangle, Sparkles, Download } from 'lucide-react';
import { tint } from '@/components/ui/kit';

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

  const [baixando, setBaixando] = useState<string | null>(null);
  async function baixar(id: string, nome: string) {
    setBaixando(id);
    try {
      const r = await fetch(`${API}/api/v1/busca-docs/download/${id}`, { headers: authHeaders() });
      if (!r.ok) { alert('Não foi possível baixar o arquivo.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nome || 'documento.xml';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { alert('Erro ao baixar.'); } finally { setBaixando(null); }
  }

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
        <Sparkles size={24} color="var(--acao)" /> Buscar Documentos
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Peça em linguagem natural. A IA interpreta e traz os arquivos <strong>+ a análise fiscal</strong>.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="Ex: NF da Laser Tech de junho acima de 1000 reais"
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--tx)', fontSize: 15 }}
          />
        </div>
        <button onClick={() => buscar()} disabled={loading}
          style={{ padding: '0 22px', borderRadius: 10, border: 'none', background: 'var(--acao)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : 'Buscar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {EXEMPLOS.map((ex) => (
          <button key={ex} onClick={() => buscar(ex)}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
            {ex}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}><Loader2 size={28} className="animate-spin" /></div>}

      {data && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Card label="Encontrados" value={`${data.encontrados}`} sub={data.totalDisponivel > data.encontrados ? `de ${data.totalDisponivel}+` : undefined} />
            <Card label="Valor total" value={BRL(data.valorTotal)} />
            <Card label="Com inconsistência" value={`${data.comInconsistencia}`} cor={data.comInconsistencia ? 'var(--atencao)' : 'var(--ok)'} />
          </div>

          {/* como o sistema interpretou a busca — transparência p/ o analista confiar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, fontSize: 12 }}>
            {data.clienteBuscado && <Chip txt={`cliente: ${data.clienteBuscado}`} cor={data.clienteNaoEncontrado ? 'var(--erro)' : 'var(--ok)'} />}
            {data.filtrosInterpretados?.year && <Chip txt={`período: ${data.filtrosInterpretados.monthStart ? data.filtrosInterpretados.monthStart + '/' : ''}${data.filtrosInterpretados.year}`} cor="var(--acao)" />}
            {data.filtrosInterpretados?.minValue != null && <Chip txt={`acima de ${BRL(data.filtrosInterpretados.minValue)}`} cor="var(--acao)" />}
            {data.filtrosInterpretados?.maxValue != null && <Chip txt={`até ${BRL(data.filtrosInterpretados.maxValue)}`} cor="var(--acao)" />}
            {data.filtroInconsistencia && <Chip txt="só com inconsistência" cor="var(--atencao)" />}
            {data.truncado && <Chip txt={`mostrando 50 de ${data.totalDisponivel}`} cor="var(--faint)" />}
          </div>

          {data.clienteNaoEncontrado && (
            <div style={{ padding: 16, color: 'var(--erro)', background: tint('var(--erro)', 8), border: `1px solid ${tint('var(--erro)', 25)}`, borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
              Não encontrei o cliente <strong>"{data.clienteBuscado}"</strong> na carteira. Verifique o nome ou busque por outro termo.
            </div>
          )}

          {data.encontrados === 0 && !data.clienteNaoEncontrado && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--faint)', border: '1px dashed var(--border)', borderRadius: 10 }}>
              Nenhum documento encontrado para essa busca.
            </div>
          )}

          {data.resultados.map((r: any) => (
            <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} color="var(--acao)" />
                    <strong>{r.emitente || r.arquivo}</strong>
                    <span style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase' }}>{r.tipo} {r.numero ? `#${r.numero}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    {r.cliente} · {dataBR(r.data)}
                    {r.ncms?.length ? ` · NCM ${r.ncms.join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{BRL(r.valor)}</div>
                  {r.impostos && <div style={{ fontSize: 11, color: 'var(--faint)' }}>ICMS {BRL(r.impostos.icms)}</div>}
                  <button onClick={() => baixar(r.id, r.arquivo)} disabled={baixando === r.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
                    {baixando === r.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} XML
                  </button>
                </div>
              </div>
              {r.inconsistencias?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: tint('var(--atencao)', 8), borderRadius: 8, border: `1px solid ${tint('var(--atencao)', 25)}` }}>
                  {r.inconsistencias.map((inc: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--atencao)' }}>
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

function Chip({ txt, cor }: { txt: string; cor: string }) {
  return <span style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${tint(cor, 25)}`, background: tint(cor, 8), color: cor }}>{txt}</span>;
}

function Card({ label, value, cor, sub }: { label: string; value: string; cor?: string; sub?: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--faint)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor || 'var(--tx-strong)', marginTop: 4 }}>
        {value} {sub && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--faint)' }}>{sub}</span>}
      </div>
    </div>
  );
}
