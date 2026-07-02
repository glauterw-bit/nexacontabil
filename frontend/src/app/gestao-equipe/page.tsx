'use client';
import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Users, Loader2, UserPlus, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const COMPANIES = gql`{ companies { id name cnpj taxRegime active } }`;

interface User { id: string; name: string; email: string; role: string; }

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function GestaoEquipePage() {
  const toast = useToast();
  const { data: compData, loading: lcomp } = useQuery(COMPANIES);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [analystId, setAnalystId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  // bulk reassign state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkMotivo, setBulkMotivo] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [uR, aR] = await Promise.all([
        fetch(`${API}/api/v1/auth/users`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/workflow/assignments?active=true`, { headers: authHeaders() }),
      ]);
      const u = uR.ok ? await uR.json() : [];
      setUsers(Array.isArray(u) ? u : []);
      const a = await aR.json();
      setAssignments(Array.isArray(a) ? a : []);
    } catch {}
  }

  const companies = compData?.companies ?? [];
  const assignedIds = new Set(assignments.map((a) => a.companyId));
  const unassigned = companies.filter((c: any) => !assignedIds.has(c.id));

  function toggle(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  function selectAll() {
    setSelected(unassigned.map((c: any) => c.id));
  }

  async function executeAssign() {
    if (!analystId || selected.length === 0) {
      toast.push('Selecione clientes + analista', { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      for (const companyId of selected) {
        await fetch(`${API}/api/v1/workflow/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ companyId, analystId, motivo }),
        });
      }
      toast.push(`${selected.length} cliente(s) atribuídos`, { variant: 'success' });
      setSelected([]); setMotivo('');
      load();
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function bulkReassign() {
    if (!bulkFrom || !bulkTo || !bulkMotivo || bulkMotivo.length < 10) {
      toast.push('Preencha origem, destino e motivo (mín 10 chars)', { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/workflow/assignments/bulk-reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ fromAnalystId: bulkFrom, toAnalystId: bulkTo, motivo: bulkMotivo }),
      });
      const d = await r.json();
      if (r.ok) {
        toast.push(`${d.moved ?? 0} cliente(s) transferidos`, { variant: 'success' });
        setBulkOpen(false); setBulkFrom(''); setBulkTo(''); setBulkMotivo('');
        load();
      } else {
        toast.push(d.message ?? 'Erro', { variant: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }

  const byAnalyst: Record<string, any[]> = {};
  for (const a of assignments) {
    if (!byAnalyst[a.analystId]) byAnalyst[a.analystId] = [];
    byAnalyst[a.analystId].push(a);
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="h-5 w-5 text-acao" />
            <h1 className="text-xl font-semibold text-tx-strong">Gestão de Equipe</h1>
          </div>
          <p className="text-sm text-tx-muted">{users.length} analista(s) · {assignments.length} cliente(s) atribuído(s)</p>
        </div>
        <button
          onClick={() => setBulkOpen(true)}
          className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg inline-flex items-center gap-1.5"
        >
          <ArrowRight className="h-3.5 w-3.5" /> Transferir carteira em massa
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Não atribuídos */}
        <div className="rounded-xl border border-line bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-tx-strong">Clientes não atribuídos ({unassigned.length})</h2>
            {unassigned.length > 0 && (
              <button onClick={selectAll} className="text-[10px] text-acao hover:underline">Selecionar todos</button>
            )}
          </div>
          {lcomp ? (
            <div className="flex items-center gap-2 text-sm text-tx-muted py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : unassigned.length === 0 ? (
            <p className="text-xs text-tx-muted text-center py-6">Todos os clientes têm analista.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {unassigned.map((c: any) => (
                <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-inset rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-tx-strong flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] text-tx-muted font-mono">{c.taxRegime?.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-line space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-tx-muted">{selected.length} selecionado(s)</p>
            <select
              value={analystId}
              onChange={(e) => setAnalystId(e.target.value)}
              className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none"
            >
              <option value="">Escolher analista…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} · {u.email} ({u.role})</option>
              ))}
            </select>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none"
            />
            <button
              onClick={executeAssign}
              disabled={loading || selected.length === 0 || !analystId}
              className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded inline-flex items-center justify-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" /> Atribuir
            </button>
          </div>
        </div>

        {/* Carteiras */}
        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="text-sm font-medium text-tx-strong mb-3">Carteiras ({Object.keys(byAnalyst).length})</h2>
          {Object.keys(byAnalyst).length === 0 ? (
            <p className="text-xs text-tx-muted text-center py-6">Nenhuma carteira distribuída.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.entries(byAnalyst).map(([analystId, items]) => {
                const user = users.find((u) => u.id === analystId);
                return (
                  <div key={analystId} className="border border-line rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm text-tx-strong font-medium">{user?.name ?? 'Analista'}</p>
                        <p className="text-[10px] text-tx-muted">{user?.email}</p>
                      </div>
                      <span className="text-xs text-acao font-mono">{items.length} cliente(s)</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.slice(0, 5).map((a: any) => (
                        <p key={a.id} className="text-[11px] text-tx truncate">
                          · {companies.find((c: any) => c.id === a.companyId)?.name ?? a.companyId.slice(0, 8)}
                        </p>
                      ))}
                      {items.length > 5 && <p className="text-[11px] text-tx-muted">+ {items.length - 5} mais</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bulk reassign modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card border border-line rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-tx-strong">Transferir carteira em massa</h2>
              <button onClick={() => setBulkOpen(false)} className="text-tx-muted hover:text-tx-strong text-xs">✕</button>
            </div>
            <p className="text-xs text-tx-muted">
              Move TODAS as empresas ativas de um analista para outro, mantendo o histórico das atribuições anteriores.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-tx-muted">De</label>
              <select value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)}
                className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none">
                <option value="">Escolher origem…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({byAnalyst[u.id]?.length ?? 0} clientes)</option>)}
              </select>
              <label className="text-[10px] uppercase text-tx-muted">Para</label>
              <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
                className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none">
                <option value="">Escolher destino…</option>
                {users.filter((u) => u.id !== bulkFrom).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <label className="text-[10px] uppercase text-tx-muted">Motivo (mín 10 chars)</label>
              <textarea value={bulkMotivo} onChange={(e) => setBulkMotivo(e.target.value)}
                rows={2} placeholder="Ex: João foi promovido a gerente, carteira passa para Maria"
                className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkOpen(false)} className="px-3 py-1.5 text-xs bg-inset border border-line text-tx rounded">Cancelar</button>
              <button onClick={bulkReassign} disabled={loading} className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded">
                Confirmar transferência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
