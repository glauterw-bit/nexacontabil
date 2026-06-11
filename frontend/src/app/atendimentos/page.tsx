'use client';
import { useEffect, useState, useCallback } from 'react';
import { Headset, Loader2, Plus, MessageCircle, Building2, Mail, Phone, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const CANAIS: Record<string, { label: string; cor: string; icon: any }> = {
  mega: { label: 'MEGA', cor: '#a855f7', icon: Building2 },
  whatsapp: { label: 'WhatsApp', cor: '#22c55e', icon: MessageCircle },
  email: { label: 'E-mail', cor: '#3b82f6', icon: Mail },
  telefone: { label: 'Telefone', cor: '#f59e0b', icon: Phone },
  manual: { label: 'Manual', cor: '#64748b', icon: Headset },
};
const STATUS = ['aberto', 'em_andamento', 'resolvido'];
const stLabel: Record<string, string> = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' };
const stCor: Record<string, string> = { aberto: '#f59e0b', em_andamento: '#6366f1', resolvido: '#10b981' };

export default function AtendimentosPage() {
  const [stats, setStats] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canal, setCanal] = useState('');
  const [status, setStatus] = useState('');
  const [nomes, setNomes] = useState<string[]>([]);
  const [novo, setNovo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = new URL(`${API}/api/v1/atendimentos`);
      if (canal) u.searchParams.set('canal', canal);
      if (status) u.searchParams.set('status', status);
      const [r, s] = await Promise.all([
        fetch(u.toString(), { headers: authHeaders() }),
        fetch(`${API}/api/v1/atendimentos/stats`, { headers: authHeaders() }),
      ]);
      if (r.ok) setLista(await r.json());
      if (s.ok) setStats(await s.json());
    } catch {} finally { setLoading(false); }
  }, [canal, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then((d) => d && setNomes(d.nomes ?? [])).catch(() => {});
  }, []);

  async function patch(id: string, data: any) {
    await fetch(`${API}/api/v1/atendimentos/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(data) });
    load();
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Headset size={24} color="#6366f1" /> Central de Atendimento
          </h1>
          <p style={{ color: '#94a3b8', marginTop: 4 }}>Todos os canais num inbox só — MEGA, WhatsApp, e-mail e telefone.</p>
        </div>
        <button onClick={() => setNovo(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> Novo atendimento
        </button>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
          <Stat label="Abertos" value={stats.abertos} cor="#f59e0b" />
          <Stat label="Em andamento" value={stats.emAndamento} cor="#6366f1" />
          <Stat label="Resolvidos" value={stats.resolvidos} cor="#10b981" />
          <Stat label="Urgentes" value={stats.urgentes} cor="#ef4444" />
        </div>
      )}

      {/* filtros de canal */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip on={canal === ''} onClick={() => setCanal('')}>Todos os canais</Chip>
        {Object.entries(CANAIS).map(([k, v]) => (
          <Chip key={k} on={canal === k} cor={v.cor} onClick={() => setCanal(canal === k ? '' : k)}>
            {v.label}{stats?.porCanal?.[k] ? ` (${stats.porCanal[k]})` : ''}
          </Chip>
        ))}
        <div style={{ flex: 1 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #2a3142', background: '#161b27', color: '#e2e8f0', fontSize: 13 }}>
          <option value="">Todos status</option>
          {STATUS.map((s) => <option key={s} value={s}>{stLabel[s]}</option>)}
        </select>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} className="animate-spin" /></div> :
        lista.length === 0 ? (
          <div style={{ marginTop: 20, padding: 30, textAlign: 'center', color: '#64748b', border: '1px dashed #2a3142', borderRadius: 12 }}>
            Nenhum atendimento{canal ? ` no canal ${CANAIS[canal]?.label}` : ''}. Os tickets do MEGA aparecem aqui assim que a integração estiver ligada.
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {lista.map((a) => {
              const c = CANAIS[a.canal] ?? CANAIS.manual; const Ico = c.icon;
              return (
                <div key={a.id} style={{ background: '#161b27', border: '1px solid #2a3142', borderLeft: `3px solid ${stCor[a.status]}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: `${c.cor}22`, color: c.cor, fontSize: 11, fontWeight: 600 }}><Ico size={12} /> {c.label}</span>
                        <strong style={{ fontSize: 14 }}>{a.clienteNome ?? 'Cliente'}</strong>
                        {a.prioridade === 'urgente' && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>URGENTE</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 4 }}>{a.assunto ?? '(sem assunto)'}</div>
                      {a.mensagem && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{a.mensagem.slice(0, 140)}</div>}
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{dataBR(a.createdAt)}{a.contato ? ` · ${a.contato}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <select value={a.status} onChange={(e) => patch(a.id, { status: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${stCor[a.status]}55`, background: '#10141d', color: stCor[a.status], fontSize: 12 }}>
                        {STATUS.map((s) => <option key={s} value={s}>{stLabel[s]}</option>)}
                      </select>
                      <input list="resp-at" defaultValue={a.responsavel ?? ''} placeholder="responsável" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.responsavel ?? '')) patch(a.id, { responsavel: v }); }}
                        style={{ width: 150, padding: '5px 8px', borderRadius: 6, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0', fontSize: 12 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <datalist id="resp-at">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
      {novo && <NovoModal nomes={nomes} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
    </div>
  );
}

function NovoModal({ nomes, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ canal: 'manual', prioridade: 'normal', categoria: 'fiscal' });
  const [busy, setBusy] = useState(false);
  async function salvar() {
    setBusy(true);
    try { await fetch(`${API}/api/v1/atendimentos`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(f) }); onSaved(); }
    finally { setBusy(false); }
  }
  const inp = (k: string, ph: string) => <input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0', fontSize: 14, marginBottom: 8 }} />;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#161b27', border: '1px solid #2a3142', borderRadius: 14, padding: 22, width: 440, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 17 }}>Novo atendimento</strong>
          <X size={18} style={{ cursor: 'pointer', color: '#64748b' }} onClick={onClose} />
        </div>
        {inp('clienteNome', 'Cliente')}
        {inp('assunto', 'Assunto')}
        {inp('mensagem', 'Descrição / dúvida')}
        {inp('contato', 'Contato (telefone/e-mail)')}
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} style={{ flex: 1, padding: 9, borderRadius: 8, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0' }}>
            {['fiscal', 'contabil', 'folha', 'financeiro', 'outro'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })} style={{ flex: 1, padding: 9, borderRadius: 8, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0' }}>
            {['baixa', 'normal', 'alta', 'urgente'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <input list="resp-at" value={f.responsavel ?? ''} onChange={(e) => setF({ ...f, responsavel: e.target.value })} placeholder="responsável" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #2a3142', background: '#10141d', color: '#e2e8f0', fontSize: 14, marginTop: 8 }} />
        <button onClick={salvar} disabled={busy} style={{ width: '100%', marginTop: 14, padding: 11, borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Salvando…' : 'Criar atendimento'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, cor }: { label: string; value: any; cor: string }) {
  return <div style={{ flex: '1 1 120px', background: '#161b27', border: '1px solid #2a3142', borderRadius: 12, padding: 14 }}><div style={{ fontSize: 12, color: '#64748b' }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700, color: cor, marginTop: 4 }}>{value ?? 0}</div></div>;
}
function Chip({ on, cor = '#6366f1', onClick, children }: any) {
  return <button onClick={onClick} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${on ? cor : '#2a3142'}`, background: on ? `${cor}22` : '#10141d', color: on ? cor : '#94a3b8', fontSize: 12, cursor: 'pointer' }}>{children}</button>;
}
