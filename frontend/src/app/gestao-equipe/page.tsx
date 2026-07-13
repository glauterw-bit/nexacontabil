'use client';
import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Users, UserPlus, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Spinner, EmptyState, COLORS } from '@/components/ui/kit';

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

  // contas & senhas
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenhaCriar, setNovaSenhaCriar] = useState('');
  const [novoPapel, setNovoPapel] = useState('analista');
  const [criando, setCriando] = useState(false);
  const [resetId, setResetId] = useState('');       // usuário em edição de senha
  const [resetSenha, setResetSenha] = useState('');
  const [resetando, setResetando] = useState(false);
  const [papeis, setPapeis] = useState<{ valor: string; descricao: string }[]>([]);
  const [meRole, setMeRole] = useState('');         // papel de quem está logado
  const [mudandoPapel, setMudandoPapel] = useState('');

  const podeGerirPapeis = ['owner', 'admin'].includes(meRole);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [uR, aR, pR, meR] = await Promise.all([
        fetch(`${API}/api/v1/auth/users`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/workflow/assignments?active=true`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/auth/admin/papeis`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/auth/me`, { headers: authHeaders() }),
      ]);
      const u = uR.ok ? await uR.json() : [];
      setUsers(Array.isArray(u) ? u : []);
      const a = await aR.json();
      setAssignments(Array.isArray(a) ? a : []);
      if (pR.ok) { const p = await pR.json(); setPapeis(Array.isArray(p) ? p : []); }
      if (meR.ok) { const m = await meR.json(); setMeRole(m?.role ?? ''); }
    } catch {}
  }

  async function mudarPapel(userId: string, papel: string) {
    setMudandoPapel(userId);
    try {
      const r = await fetch(`${API}/api/v1/auth/admin/definir-papel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ userId, papel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Falha ao alterar papel');
      toast.push('Poderes atualizados ✅', { variant: 'success' });
      setUsers((us) => us.map((x) => x.id === userId ? { ...x, role: papel } : x));
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setMudandoPapel(''); }
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

  async function criarAnalista() {
    if (!novoNome.trim() || !novoEmail.trim() || novaSenhaCriar.length < 6) {
      toast.push('Nome, e-mail e senha (mín. 6) são obrigatórios', { variant: 'warning' }); return;
    }
    setCriando(true);
    try {
      const r = await fetch(`${API}/api/v1/auth/admin/criar-analista`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: novoNome.trim(), email: novoEmail.trim(), password: novaSenhaCriar, role: novoPapel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Falha ao criar');
      toast.push(`Conta criada (${d.role}) · ${d.clientesVinculados} cliente(s) já vinculados pelo nome`, { variant: 'success' });
      if (d.clientesVinculados === 0) toast.push('Atenção: nenhum cliente com esse nome de responsável. Confira se o nome bate com a carteira.', { variant: 'warning' });
      setNovoNome(''); setNovoEmail(''); setNovaSenhaCriar(''); setNovoPapel('analista'); load();
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setCriando(false); }
  }

  async function redefinirSenha(userId: string) {
    if (resetSenha.length < 6) { toast.push('A nova senha precisa de ao menos 6 caracteres', { variant: 'warning' }); return; }
    setResetando(true);
    try {
      const r = await fetch(`${API}/api/v1/auth/admin/redefinir-senha`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ userId, novaSenha: resetSenha }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Falha ao redefinir');
      toast.push('Senha redefinida ✅', { variant: 'success' });
      setResetId(''); setResetSenha('');
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setResetando(false); }
  }

  const byAnalyst: Record<string, any[]> = {};
  for (const a of assignments) {
    if (!byAnalyst[a.analystId]) byAnalyst[a.analystId] = [];
    byAnalyst[a.analystId].push(a);
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Users size={22} color={COLORS.acao} />}
        title="Gestão de Equipe"
        subtitle={`${users.length} analista(s) · ${assignments.length} cliente(s) atribuído(s)`}
        action={
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <ArrowRight className="h-3.5 w-3.5" /> Transferir carteira em massa
          </button>
        }
      />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Não atribuídos */}
        <div className="card-aura">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[13px] font-medium text-tx-strong">Clientes não atribuídos ({unassigned.length})</h2>
            {unassigned.length > 0 && (
              <button onClick={selectAll} className="text-[10px] text-acao hover:underline">Selecionar todos</button>
            )}
          </div>
          {lcomp ? (
            <Spinner pad={24} />
          ) : unassigned.length === 0 ? (
            <EmptyState icon={<Users size={28} />} title="Todos os clientes têm analista." />
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
              className="input-aura w-full"
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
              className="input-aura w-full"
            />
            <button
              onClick={executeAssign}
              disabled={loading || selected.length === 0 || !analystId}
              className="btn-primary w-full justify-center"
            >
              <UserPlus className="h-3.5 w-3.5" /> Atribuir
            </button>
          </div>
        </div>

        {/* Carteiras */}
        <div className="card-aura">
          <h2 className="text-[13px] font-medium text-tx-strong mb-3">Carteiras ({Object.keys(byAnalyst).length})</h2>
          {Object.keys(byAnalyst).length === 0 ? (
            <EmptyState icon={<Users size={28} />} title="Nenhuma carteira distribuída." />
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
                      <span className="num text-xs text-tx-muted">{items.length} cliente(s)</span>
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

      {/* Contas & senhas dos analistas */}
      <div className="card-aura">
        <h2 className="text-[13px] font-medium text-tx-strong mb-1">Contas & senhas</h2>
        <p className="text-[11px] text-tx-muted mb-3">
          O <b className="text-tx">nome</b> da conta precisa bater com o responsável nas empresas — é assim que o analista vê a própria carteira no Meu Dia.
        </p>

        {/* criar analista */}
        <div className="grid sm:grid-cols-5 gap-2 mb-1">
          <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome (igual ao responsável)" className="input-aura sm:col-span-1" />
          <input value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="E-mail de acesso" className="input-aura sm:col-span-1" />
          <input value={novaSenhaCriar} onChange={(e) => setNovaSenhaCriar(e.target.value)} placeholder="Senha inicial (mín. 6)" type="text" className="input-aura sm:col-span-1" />
          <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} className="input-aura sm:col-span-1"
            title={podeGerirPapeis ? 'Poderes da conta' : 'Só o dono/admin pode criar admin ou contador'}>
            {(papeis.length ? papeis : [{ valor: 'analista', descricao: 'Analista' }, { valor: 'assistente', descricao: 'Assistente' }]).map((p) => (
              <option key={p.valor} value={p.valor} disabled={!podeGerirPapeis && (p.valor === 'admin' || p.valor === 'contador')}>
                {p.valor.charAt(0).toUpperCase() + p.valor.slice(1)}
              </option>
            ))}
          </select>
          <button onClick={criarAnalista} disabled={criando} className="btn-primary justify-center">
            <UserPlus className="h-3.5 w-3.5" /> {criando ? 'Criando…' : 'Criar conta'}
          </button>
        </div>
        <p className="text-[10px] text-tx-muted mb-4">
          {papeis.find((p) => p.valor === novoPapel)?.descricao ?? 'Escolha os poderes da conta.'}
        </p>

        {/* lista com redefinir senha */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {users.length === 0 && <EmptyState icon={<Users size={26} />} title="Nenhuma conta ainda." />}
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 p-2 border-b border-line/60">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-tx-strong truncate">{u.name}</p>
                <p className="text-[11px] text-tx-muted truncate">{u.email}</p>
              </div>
              {/* poderes (papel) */}
              {podeGerirPapeis && u.role !== 'owner' ? (
                <select value={u.role} disabled={mudandoPapel === u.id}
                  onChange={(e) => mudarPapel(u.id, e.target.value)}
                  className="input-aura" style={{ padding: '5px 8px', fontSize: 12, width: 130 }}
                  title="Definir poderes">
                  {(papeis.length ? papeis : [{ valor: u.role, descricao: u.role }]).map((p) => (
                    <option key={p.valor} value={p.valor}>{p.valor.charAt(0).toUpperCase() + p.valor.slice(1)}</option>
                  ))}
                  {!papeis.some((p) => p.valor === u.role) && <option value={u.role}>{u.role}</option>}
                </select>
              ) : (
                <span className="text-[10px] text-tx-muted px-2 py-1 rounded" style={{ background: COLORS.surface2 }}>{u.role}</span>
              )}
              {resetId === u.id ? (
                <div className="flex items-center gap-1.5">
                  <input value={resetSenha} onChange={(e) => setResetSenha(e.target.value)} placeholder="Nova senha" type="text"
                    className="input-aura" style={{ padding: '5px 8px', fontSize: 12, width: 150 }} autoFocus />
                  <button onClick={() => redefinirSenha(u.id)} disabled={resetando} className="btn-primary" style={{ padding: '5px 10px', fontSize: 12 }}>
                    {resetando ? '…' : 'Salvar'}
                  </button>
                  <button onClick={() => { setResetId(''); setResetSenha(''); }} className="btn-ghost" style={{ padding: '5px 8px', fontSize: 12 }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setResetId(u.id); setResetSenha(''); }} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }}
                  disabled={u.role === 'owner'} title={u.role === 'owner' ? 'A conta do dono não é redefinida por aqui' : 'Redefinir senha'}>
                  Redefinir senha
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bulk reassign modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-[rgba(13,17,25,0.45)] flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card border border-line rounded-xl shadow-pop p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-tx-strong">Transferir carteira em massa</h2>
              <button onClick={() => setBulkOpen(false)} className="btn-ghost p-1 text-xs">✕</button>
            </div>
            <p className="text-xs text-tx-muted">
              Move TODAS as empresas ativas de um analista para outro, mantendo o histórico das atribuições anteriores.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-tx-muted">De</label>
              <select value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)}
                className="input-aura w-full">
                <option value="">Escolher origem…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({byAnalyst[u.id]?.length ?? 0} clientes)</option>)}
              </select>
              <label className="text-[10px] uppercase text-tx-muted">Para</label>
              <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
                className="input-aura w-full">
                <option value="">Escolher destino…</option>
                {users.filter((u) => u.id !== bulkFrom).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <label className="text-[10px] uppercase text-tx-muted">Motivo (mín 10 chars)</label>
              <textarea value={bulkMotivo} onChange={(e) => setBulkMotivo(e.target.value)}
                rows={2} placeholder="Ex: João foi promovido a gerente, carteira passa para Maria"
                className="input-aura w-full" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkOpen(false)} className="btn-secondary text-xs">Cancelar</button>
              <button onClick={bulkReassign} disabled={loading} className="btn-primary text-xs">
                Confirmar transferência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
