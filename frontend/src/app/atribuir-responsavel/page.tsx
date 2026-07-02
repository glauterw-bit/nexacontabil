'use client';
import { useEffect, useState, useCallback } from 'react';
import { UserCheck, Loader2, Shuffle, Search, CheckSquare, Square } from 'lucide-react';

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
    <div style={{ maxWidth: 1050, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <UserCheck size={24} color="#10b981" /> Atribuir Responsáveis
      </h1>
      <p style={{ color: '#94a3b8', marginTop: 4 }}>
        Distribua os clientes entre os analistas. Destrava <strong>Meu Dia</strong> e <strong>Produtividade</strong> por pessoa.
      </p>

      {meta && (
        <div style={{ display: 'flex', gap: 14, marginTop: 18 }}>
          <Stat label="Clientes" value={meta.total} cor="#e2e8f0" />
          <Stat label="Sem responsável" value={meta.naoAtribuidos} cor={meta.naoAtribuidos ? '#f59e0b' : '#10b981'} />
          <Stat label="Responsáveis" value={meta.nomes.length} cor="#6366f1" />
        </div>
      )}

      {/* distribuição automática */}
      <div style={{ marginTop: 20, background: '#0f1722', border: '1px solid #1d3a2e', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#34d399' }}><Shuffle size={16} /> Distribuição automática</div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 10px' }}>Divide os clientes sem responsável igualmente (round-robin) entre os nomes abaixo.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nomesAuto} onChange={(e) => setNomesAuto(e.target.value)} placeholder="João, Maria, Pedro"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #2a3142', background: '#161b27', color: '#e2e8f0', fontSize: 14 }} />
          <button onClick={distribuir} disabled={busy}
            style={{ padding: '0 18px', borderRadius: 8, border: 'none', background: '#10b981', color: '#06281c', fontWeight: 700, cursor: 'pointer' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Distribuir'}
          </button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, padding: 10, background: '#161b27', border: '1px solid #2a3142', borderRadius: 8, fontSize: 13, color: '#cbd5e1' }}>{msg}</div>}

      {/* filtros + bulk */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#64748b' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…"
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid #2a3142', background: '#161b27', color: '#e2e8f0', fontSize: 14 }} />
        </div>
        <button onClick={() => setSoSem(!soSem)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #2a3142', background: soSem ? '#f59e0b22' : '#10141d', color: soSem ? '#f59e0b' : '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          Só sem responsável
        </button>
      </div>

      {sel.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, padding: 10, background: '#161b27', border: '1px solid #6366f155', borderRadius: 8 }}>
          <strong style={{ fontSize: 13 }}>{sel.size} selecionado(s)</strong>
          <input list="resp-list" value={bulkResp} onChange={(e) => setBulkResp(e.target.value)} placeholder="responsável…"
            style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0', fontSize: 13 }} />
          <button onClick={() => atribuir([...sel], bulkResp)} disabled={busy || !bulkResp.trim()}
            style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Atribuir</button>
        </div>
      )}

      <datalist id="resp-list">{meta?.nomes?.map((n: string) => <option key={n} value={n} />)}</datalist>

      {/* lista */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>
          <span onClick={toggleAll} style={{ cursor: 'pointer', color: '#94a3b8' }}>{allSel ? <CheckSquare size={16} /> : <Square size={16} />}</span>
          <span style={{ flex: 1 }}>Cliente</span>
          <span style={{ width: 220 }}>Responsável</span>
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 30 }}><Loader2 size={24} className="animate-spin" /></div> :
          clientes.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#161b27', border: '1px solid #2a3142', borderRadius: 8, padding: '10px 12px', marginBottom: 6 }}>
              <span onClick={() => toggle(c.id)} style={{ cursor: 'pointer', color: sel.has(c.id) ? '#6366f1' : '#475569' }}>{sel.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{c.taxRegime}{c.sharepointDocsCount ? ` · ${c.sharepointDocsCount} docs` : ''}{!c.active ? ' · inativo' : ''}</div>
              </div>
              <input list="resp-list" defaultValue={c.responsavel ?? ''} placeholder="—"
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.responsavel ?? '')) atribuir([c.id], v); }}
                style={{ width: 220, padding: '7px 10px', borderRadius: 6, border: `1px solid ${c.responsavel ? '#2a3142' : '#3a3215'}`, background: '#10141d', color: c.responsavel ? '#e2e8f0' : '#64748b', fontSize: 13 }} />
            </div>
          ))}
        {!loading && clientes.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>Nenhum cliente.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return (
    <div style={{ flex: '1 1 120px', background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div>
    </div>
  );
}
