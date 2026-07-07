'use client';
import { useEffect, useState, useCallback } from 'react';
import { Workflow, Loader2, FileCheck, RefreshCw, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader, COLORS, tint, Spinner } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
const compAtual = () => new Date().toISOString().slice(0, 7);

export default function FluxoPage() {
  const [dep, setDep] = useState<'fiscal' | 'contabil'>('fiscal');
  const [comp, setComp] = useState(compAtual());
  const [board, setBoard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [meses, setMeses] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/fluxo/competencias`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then((d) => { if (d?.length) { setMeses(d); setComp(d[0].competencia); } }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/fluxo/board?departamento=${dep}&competencia=${comp}`, { headers: authHeaders() });
      if (r.ok) setBoard(await r.json());
    } catch {} finally { setLoading(false); }
  }, [dep, comp]);
  useEffect(() => { load(); }, [load]);

  async function mover(companyId: string, etapa: string) {
    await fetch(`${API}/api/v1/fluxo/mover`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ companyId, departamento: dep, competencia: comp, etapa }) });
    load();
  }
  async function verificarRecibos() {
    setVerificando(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/fluxo/verificar-recibos-lote`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ competencia: comp, limit: 8 }) });
      const d = await r.json();
      setMsg(`Verificados ${d.verificados} clientes · ${d.recibosEncontrados} recibos encontrados no drive`);
      load();
    } catch { setMsg('Erro ao verificar.'); } finally { setVerificando(false); }
  }

  const colunas = board?.colunas ?? [];
  const idx = (k: string) => colunas.findIndex((c: any) => c.key === k);

  return (
    <div className="page">
      <PageHeader icon={<Workflow size={22} color={COLORS.acao} />} title="Fluxo de Trabalho"
        subtitle="Acompanhe cada cliente nas etapas do mês. A validação de recibos é automática (lê o drive)."
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {meses.length > 0 ? (
              <select value={comp} onChange={(e) => setComp(e.target.value)} title="Mês a apurar (retroativo)" className="input-aura">
                {meses.map((m) => <option key={m.competencia} value={m.competencia}>{m.competencia} ({m.docs} docs)</option>)}
              </select>
            ) : (
              <input type="month" value={comp} onChange={(e) => setComp(e.target.value)} className="input-aura" />
            )}
            <button onClick={load} className="btn-ghost" aria-label="Atualizar"><RefreshCw size={14} /></button>
          </div>
        } />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {(['fiscal', 'contabil'] as const).map((d) => (
          <button key={d} onClick={() => setDep(d)} className={dep === d ? 'btn-primary' : 'btn-secondary'}>
            {d === 'fiscal' ? 'Fiscal' : 'Contábil'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {dep === 'fiscal' && (
          <button onClick={verificarRecibos} disabled={verificando} className="btn-primary">
            {verificando ? <Loader2 size={15} className="animate-spin" /> : <FileCheck size={15} />} Validar recibos no drive
          </button>
        )}
      </div>
      {msg && <div style={{ marginBottom: 12, padding: 10, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, color: 'var(--tx)' }}>{msg}</div>}

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {colunas.map((col: any, ci: number) => (
            <div key={col.key} style={{ minWidth: 260, flex: '0 0 260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: '8px 8px 0 0', background: tint(col.cor, 13), borderTop: `2px solid ${col.cor}` }}>
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{col.label}</span>
                <span style={{ fontSize: 12, color: COLORS.muted, background: COLORS.surface2, borderRadius: 10, padding: '1px 8px' }}>{col.cards.length}</span>
              </div>
              <div style={{ background: COLORS.surface2, minHeight: 120, padding: 6, borderRadius: '0 0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {col.cards.map((c: any) => (
                  <div key={c.companyId} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>{c.regime} · {c.docs} docs</div>
                    {col.key === 'validacao' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, marginTop: 4, color: c.reciboEncontrado ? COLORS.ok : COLORS.atencao }}>
                        {c.reciboEncontrado ? <><CheckCircle2 size={12} /> recibo: {c.reciboArquivo?.slice(0, 18)}</> : <><AlertCircle size={12} /> recibo pendente</>}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <button onClick={() => ci > 0 && mover(c.companyId, colunas[ci - 1].key)} disabled={ci === 0}
                        style={{ padding: 2, border: 'none', background: 'transparent', color: ci === 0 ? COLORS.faint : COLORS.muted, cursor: ci === 0 ? 'default' : 'pointer' }}><ChevronLeft size={16} /></button>
                      <button onClick={() => ci < colunas.length - 1 && mover(c.companyId, colunas[ci + 1].key)} disabled={ci === colunas.length - 1}
                        style={{ padding: 2, border: 'none', background: 'transparent', color: ci === colunas.length - 1 ? COLORS.faint : COLORS.acao, cursor: ci === colunas.length - 1 ? 'default' : 'pointer' }}><ChevronRight size={16} /></button>
                    </div>
                  </div>
                ))}
                {col.cards.length === 0 && <div style={{ fontSize: 11, color: COLORS.faint, textAlign: 'center', padding: 12 }}>—</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
