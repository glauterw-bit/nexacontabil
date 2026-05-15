'use client';
import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Users, Loader2, UserPlus, Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const COMPANIES = gql`{ companies { id name cnpj taxRegime active } }`;

interface User { id: string; name: string; email: string; role: string; }

export default function GestaoEquipePage() {
  const toast = useToast();
  const { data: compData, loading: lcomp } = useQuery(COMPANIES);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [analyst, setAnalyst] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const token = localStorage.getItem('aura_token') ?? '';
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const [uR, aR] = await Promise.all([
        fetch(`${API}/api/v1/auth/users`, { headers }).catch(() => null),
        fetch(`${API}/api/v1/workflow/assignments?active=true`, { headers }),
      ]);
      // /auth/users pode não existir — fallback empty
      const u = uR && uR.ok ? await uR.json() : [];
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

  async function executeAssign() {
    if (!analyst || selected.length === 0) {
      toast.push('Selecione clientes + analista', { variant: 'warning' });
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('aura_token') ?? '';
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    try {
      for (const companyId of selected) {
        await fetch(`${API}/api/v1/workflow/assignments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ companyId, analystId: analyst, motivo }),
        });
      }
      toast.push(`${selected.length} cliente(s) atribuídos`, { variant: 'success' });
      setSelected([]);
      setMotivo('');
      load();
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // agrupa atribuições por analista
  const byAnalyst: Record<string, any[]> = {};
  for (const a of assignments) {
    if (!byAnalyst[a.analystId]) byAnalyst[a.analystId] = [];
    byAnalyst[a.analystId].push(a);
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Users className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Gestão de Equipe</h1>
        </div>
        <p className="text-sm text-gray-400">
          Atribua clientes para analistas. Mudanças ficam no histórico.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Esquerda: lista de clientes não atribuídos */}
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
          <h2 className="text-sm font-medium text-white mb-2">
            Clientes não atribuídos ({unassigned.length})
          </h2>
          {lcomp ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : unassigned.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">Todos os clientes têm analista designado.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {unassigned.map((c: any) => (
                <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{c.taxRegime?.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[#1e2740] space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{selected.length} selecionado(s)</p>
            <input
              value={analyst}
              onChange={(e) => setAnalyst(e.target.value)}
              placeholder="ID do analista (user id)"
              className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none font-mono"
            />
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none"
            />
            <button
              onClick={executeAssign}
              disabled={loading || selected.length === 0 || !analyst}
              className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded inline-flex items-center justify-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" /> Atribuir ao analista
            </button>
          </div>
        </div>

        {/* Direita: carteiras por analista */}
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
          <h2 className="text-sm font-medium text-white mb-2">Carteiras atuais</h2>
          {Object.keys(byAnalyst).length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">Nenhuma carteira distribuída ainda.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.entries(byAnalyst).map(([analystId, items]) => (
                <div key={analystId} className="border border-[#1e2740] rounded p-2">
                  <p className="text-xs text-indigo-300 font-mono mb-1">{analystId.slice(0, 8)}…</p>
                  <p className="text-[11px] text-gray-500 mb-2">{items.length} cliente(s)</p>
                  <div className="space-y-0.5">
                    {items.slice(0, 5).map((a: any) => (
                      <p key={a.id} className="text-[11px] text-gray-300 truncate">
                        · {companies.find((c: any) => c.id === a.companyId)?.name ?? a.companyId.slice(0, 8)}
                      </p>
                    ))}
                    {items.length > 5 && <p className="text-[11px] text-gray-500">+ {items.length - 5} mais</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs text-amber-300">
          <strong>Dica:</strong> a v1 usa o User ID como identificador do analista. A v2 trará dropdown com lista de usuários do escritório e papéis (júnior/pleno/sênior).
        </p>
      </div>
    </div>
  );
}
