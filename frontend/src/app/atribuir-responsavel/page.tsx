'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { UserCheck, Loader2, Shuffle, Search, Users } from 'lucide-react';
import { tint, PageHeader, COLORS, Kpi, Card, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
const SEM = '— sem responsável —';

export default function GestaoCarteiraPage() {
  const [meta, setMeta] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<string>('');   // '' = todos · SEM · nome do analista
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try { const r = await fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() }); if (r.ok) setMeta(await r.json()); } catch {}
  }, []);
  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL(`${API}/api/v1/paineis/clientes-atribuicao`);
      if (q) u.searchParams.set('q', q);
      const r = await fetch(u.toString(), { headers: authHeaders() });
      if (r.ok) setClientes(await r.json());
    } catch {} finally { setLoading(false); }
  }, [q]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { const t = setTimeout(loadClientes, 300); return () => clearTimeout(t); }, [loadClientes]);

  // contagem por analista (a partir da lista carregada)
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    let sem = 0;
    for (const c of clientes) { if (c.responsavel) m.set(c.responsavel, (m.get(c.responsavel) ?? 0) + 1); else sem++; }
    return { porAnalista: m, sem };
  }, [clientes]);

  const nomes: string[] = meta?.nomes ?? [];
  const lista = useMemo(() => clientes.filter((c) => {
    if (filtro === '') return true;
    if (filtro === SEM) return !c.responsavel;
    return c.responsavel === filtro;
  }), [clientes, filtro]);

  async function mover(companyId: string, responsavel: string) {
    setSalvando(companyId);
    try {
      await fetch(`${API}/api/v1/paineis/atribuir`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ companyIds: [companyId], responsavel: responsavel === SEM ? '' : responsavel }) });
      // atualiza local sem recarregar tudo
      setClientes((prev) => prev.map((c) => c.id === companyId ? { ...c, responsavel: responsavel === SEM ? null : responsavel } : c));
      loadMeta();
    } catch {} finally { setSalvando(null); }
  }

  async function distribuirAuto() {
    if (!nomes.length) { setMsg('Cadastre analistas primeiro.'); return; }
    if (!confirm(`Distribuir os clientes SEM responsável igualmente entre os ${nomes.length} analistas?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/paineis/distribuir`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nomes }) });
      const d = await r.json();
      setMsg(d.erro ? d.erro : `${d.distribuidos} clientes distribuídos.`);
      loadMeta(); loadClientes();
    } catch { setMsg('Erro na distribuição.'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <PageHeader icon={<UserCheck size={22} color={COLORS.acao} />} title="Gestão de Carteira"
        subtitle="Direcione cada cliente para um analista — escolha no menu ao lado do cliente. Simples e na hora."
        action={<button onClick={distribuirAuto} disabled={busy} className="btn-secondary" style={{ fontSize: 13 }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />} Distribuir automático</button>} />

      {meta && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Kpi label="Clientes" value={meta.total ?? 0} />
          <Kpi label="Sem responsável" value={meta.naoAtribuidos ?? 0} cor={meta.naoAtribuidos ? COLORS.atencao : COLORS.ok} />
          <Kpi label="Analistas" value={nomes.length} />
        </div>
      )}

      {/* FILTROS por analista (clique p/ ver a carteira de cada um) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Chip ativo={filtro === ''} onClick={() => setFiltro('')} label={`Todos (${clientes.length})`} />
        <Chip ativo={filtro === SEM} onClick={() => setFiltro(SEM)} label={`Sem responsável (${contagem.sem})`} cor={COLORS.atencao} />
        {nomes.map((n) => <Chip key={n} ativo={filtro === n} onClick={() => setFiltro(n)} label={`${n} (${contagem.porAnalista.get(n) ?? 0})`} />)}
      </div>

      {msg && <div style={{ marginBottom: 12, padding: 10, background: tint(COLORS.dotOk, 8), border: `1px solid ${tint(COLORS.dotOk, 25)}`, borderRadius: 8, fontSize: 13, color: COLORS.ok }}>{msg}</div>}

      {/* busca */}
      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 360 }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: COLORS.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="input-aura" style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13 }} />
      </div>

      {/* lista com dropdown por cliente */}
      {loading ? <Spinner pad={30} /> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {lista.length === 0 && <EmptyState icon={<Users size={28} />} title="Nenhum cliente neste filtro." />}
          {lista.slice(0, 400).map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < lista.length - 1 ? `1px solid ${COLORS.borderSoft}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: COLORS.faint }}>{c.taxRegime}{c.sharepointDocsCount ? ` · ${c.sharepointDocsCount} docs` : ''}{!c.active ? ' · inativo' : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {salvando === c.id && <Loader2 size={13} className="animate-spin" style={{ color: COLORS.acao }} />}
                <select value={c.responsavel ?? SEM} onChange={(e) => mover(c.id, e.target.value)}
                  className="input-aura" style={{ width: 210, padding: '7px 8px', fontSize: 13, cursor: 'pointer', borderColor: c.responsavel ? COLORS.border : tint(COLORS.dotAtencao, 30), color: c.responsavel ? COLORS.strong : COLORS.faint }}>
                  <option value={SEM}>{SEM}</option>
                  {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Chip({ ativo, onClick, label, cor }: { ativo: boolean; onClick: () => void; label: string; cor?: string }) {
  const c = cor ?? COLORS.acao;
  return (
    <button onClick={onClick} style={{ padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: ativo ? 700 : 500, cursor: 'pointer',
      background: ativo ? tint(c, 14) : COLORS.surface, border: `1px solid ${ativo ? tint(c, 40) : COLORS.border}`, color: ativo ? c : COLORS.muted }}>
      {label}
    </button>
  );
}
