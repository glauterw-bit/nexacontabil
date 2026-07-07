'use client';
import { useEffect, useState, useCallback } from 'react';
import { UserCheck, Loader2, Shuffle, Search, CheckSquare, Square } from 'lucide-react';
import { tint, PageHeader, COLORS, Kpi, Card, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function AtribuirResponsavelPage() {
  const [meta, setMeta] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [soSem, setSoSem] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkResp, setBulkResp] = useState('');
  const [nomesAuto, setNomesAuto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    try { const r = await fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() }); if (r.ok) setMeta(await r.json()); } catch {}
  }, []);
  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL(`${API}/api/v1/paineis/clientes-atribuicao`);
      if (q) u.searchParams.set('q', q);
      if (soSem) u.searchParams.set('sem', '1');
      const r = await fetch(u.toString(), { headers: authHeaders() });
      if (r.ok) setClientes(await r.json());
    } catch {} finally { setLoading(false); }
  }, [q, soSem]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { const t = setTimeout(loadClientes, 300); return () => clearTimeout(t); }, [loadClientes]);

  async function atribuir(companyIds: string[], responsavel: string) {
    if (!companyIds.length) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/paineis/atribuir`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ companyIds, responsavel }) });
      const d = await r.json();
      setMsg(`${d.atualizados} cliente(s) → ${d.responsavel ?? 'sem responsável'}`);
      setSel(new Set()); loadMeta(); loadClientes();
    } catch { setMsg('Erro ao atribuir.'); } finally { setBusy(false); }
  }

  async function distribuir() {
    const nomes = nomesAuto.split(',').map((s) => s.trim()).filter(Boolean);
    if (!nomes.length) { setMsg('Digite os nomes dos analistas separados por vírgula.'); return; }
    if (!confirm(`Distribuir os ${meta?.naoAtribuidos ?? 0} clientes sem responsável entre: ${nomes.join(', ')}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/paineis/distribuir`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nomes }) });
      const d = await r.json();
      if (d.erro) setMsg(d.erro);
      else setMsg(`${d.distribuidos} clientes distribuídos: ${d.porResponsavel.map((p: any) => `${p.nome} (${p.clientes})`).join(' · ')}`);
      loadMeta(); loadClientes();
    } catch { setMsg('Erro na distribuição.'); } finally { setBusy(false); }
  }

  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const allSel = clientes.length > 0 && clientes.every((c) => sel.has(c.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(clientes.map((c) => c.id)));

  return (
    <div className="page">
      <PageHeader
        icon={<UserCheck size={22} color={COLORS.acao} />}
        title="Atribuir Responsáveis"
        subtitle="Distribua os clientes entre os analistas. Destrava Meu Dia e Produtividade por pessoa."
      />

      {meta && (
        <div style={{ display: 'flex', gap: 14 }}>
          <Kpi label="Clientes" value={meta.total ?? 0} cor="var(--tx-strong)" />
          <Kpi label="Sem responsável" value={meta.naoAtribuidos ?? 0} cor={meta.naoAtribuidos ? 'var(--atencao)' : 'var(--ok)'} />
          <Kpi label="Responsáveis" value={meta.nomes.length} cor="var(--tx-strong)" />
        </div>
      )}

      {/* distribuição automática */}
      <Card style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--tx-strong)' }}><Shuffle size={16} color={COLORS.muted} /> Distribuição automática</div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 10px' }}>Divide os clientes sem responsável igualmente (round-robin) entre os nomes abaixo.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nomesAuto} onChange={(e) => setNomesAuto(e.target.value)} placeholder="João, Maria, Pedro"
            className="input-aura" style={{ flex: 1 }} />
          <button onClick={distribuir} disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Distribuir'}
          </button>
        </div>
      </Card>

      {msg && <div style={{ marginTop: 12, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--tx)' }}>{msg}</div>}

      {/* filtros + bulk */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--faint)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…"
            className="input-aura" style={{ width: '100%', paddingLeft: 36 }} />
        </div>
        <button onClick={() => setSoSem(!soSem)} className="btn-secondary" style={soSem ? { background: tint('var(--atencao)', 13), color: 'var(--atencao)', borderColor: tint('var(--atencao)', 30) } : undefined}>
          Só sem responsável
        </button>
      </div>

      {sel.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, padding: 10, background: 'var(--surface)', border: `1px solid ${tint('var(--acao)', 33)}`, borderRadius: 8 }}>
          <strong style={{ fontSize: 13 }}>{sel.size} selecionado(s)</strong>
          <input list="resp-list" value={bulkResp} onChange={(e) => setBulkResp(e.target.value)} placeholder="responsável…"
            className="input-aura" style={{ flex: 1 }} />
          <button onClick={() => atribuir([...sel], bulkResp)} disabled={busy || !bulkResp.trim()} className="btn-primary">Atribuir</button>
        </div>
      )}

      <datalist id="resp-list">{meta?.nomes?.map((n: string) => <option key={n} value={n} />)}</datalist>

      {/* lista */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <span onClick={toggleAll} style={{ cursor: 'pointer', color: 'var(--muted)' }}>{allSel ? <CheckSquare size={16} /> : <Square size={16} />}</span>
          <span style={{ flex: 1 }}>Cliente</span>
          <span style={{ width: 220 }}>Responsável</span>
        </div>
        {loading ? <Spinner pad={30} /> :
          clientes.map((c) => (
            <Card key={c.id} style={{ marginBottom: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span onClick={() => toggle(c.id)} style={{ cursor: 'pointer', color: sel.has(c.id) ? 'var(--acao)' : 'var(--faint)' }}>{sel.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{c.taxRegime}{c.sharepointDocsCount ? ` · ${c.sharepointDocsCount} docs` : ''}{!c.active ? ' · inativo' : ''}</div>
                </div>
                <input list="resp-list" defaultValue={c.responsavel ?? ''} placeholder="—"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.responsavel ?? '')) atribuir([c.id], v); }}
                  className="input-aura" style={{ width: 220, borderColor: c.responsavel ? undefined : tint('var(--atencao)', 30), color: c.responsavel ? undefined : 'var(--faint)' }} />
              </div>
            </Card>
          ))}
        {!loading && clientes.length === 0 && <EmptyState icon={<UserCheck size={28} />} title="Nenhum cliente." />}
      </div>
    </div>
  );
}
