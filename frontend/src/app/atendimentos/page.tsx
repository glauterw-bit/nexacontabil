'use client';
import { useEffect, useState, useCallback } from 'react';
import { Headset, Loader2, Plus, MessageCircle, Building2, Mail, Phone, X, Send } from 'lucide-react';
import { tint, COLORS, PageHeader, Card, Kpi, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const CANAIS: Record<string, { label: string; cor: string; icon: any }> = {
  mega: { label: 'MEGA', cor: '#a855f7', icon: Building2 },
  whatsapp: { label: 'WhatsApp', cor: 'var(--ok)', icon: MessageCircle },
  email: { label: 'E-mail', cor: 'var(--info)', icon: Mail },
  telefone: { label: 'Telefone', cor: 'var(--atencao)', icon: Phone },
  manual: { label: 'Manual', cor: 'var(--faint)', icon: Headset },
};
const STATUS = ['aberto', 'em_andamento', 'resolvido'];
const stLabel: Record<string, string> = { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' };
const stCor: Record<string, string> = { aberto: 'var(--atencao)', em_andamento: 'var(--acao)', resolvido: 'var(--ok)' };

export default function AtendimentosPage() {
  const [stats, setStats] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [canal, setCanal] = useState('');
  const [status, setStatus] = useState('');
  const [nomes, setNomes] = useState<string[]>([]);
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

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
    <div className="page">
      <PageHeader
        icon={<Headset size={22} color={COLORS.acao} />}
        title="Central de Atendimento"
        subtitle="Todos os canais num inbox só — MEGA, WhatsApp, e-mail e telefone."
        action={
          <button onClick={() => setNovo(true)} className="btn-primary">
            <Plus size={16} /> Novo atendimento
          </button>
        }
      />

      {stats && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Kpi label="Abertos" value={stats.abertos ?? 0} cor="var(--atencao)" />
          <Kpi label="Em andamento" value={stats.emAndamento ?? 0} cor="var(--acao)" />
          <Kpi label="Resolvidos" value={stats.resolvidos ?? 0} cor="var(--ok)" />
          <Kpi label="Urgentes" value={stats.urgentes ?? 0} cor="var(--erro)" />
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-aura" style={{ fontSize: 13 }}>
          <option value="">Todos status</option>
          {STATUS.map((s) => <option key={s} value={s}>{stLabel[s]}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> :
        lista.length === 0 ? (
          <EmptyState icon={<Headset size={28} />}
            title={`Nenhum atendimento${canal ? ` no canal ${CANAIS[canal]?.label}` : ''}.`}
            sub="Os tickets do MEGA aparecem aqui assim que a integração estiver ligada." />
        ) : (
          <div style={{ marginTop: 16 }}>
            {lista.map((a) => {
              const c = CANAIS[a.canal] ?? CANAIS.manual; const Ico = c.icon;
              return (
                <Card key={a.id} accent={stCor[a.status]} style={{ padding: '12px 16px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setAberto(a.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: tint(c.cor, 13), color: c.cor, fontSize: 11, fontWeight: 600 }}><Ico size={12} /> {c.label}</span>
                        <strong style={{ fontSize: 14 }}>{a.clienteNome ?? 'Cliente'}</strong>
                        {a.prioridade === 'urgente' && <span style={{ fontSize: 11, color: 'var(--erro)', fontWeight: 700 }}>URGENTE</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--tx)', marginTop: 4 }}>{a.assunto ?? '(sem assunto)'}</div>
                      {a.mensagem && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{a.mensagem.slice(0, 140)}</div>}
                      <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>{dataBR(a.createdAt)}{a.contato ? ` · ${a.contato}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <select value={a.status} onChange={(e) => patch(a.id, { status: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${tint(stCor[a.status], 33)}`, background: 'var(--surface2)', color: stCor[a.status], fontSize: 12 }}>
                        {STATUS.map((s) => <option key={s} value={s}>{stLabel[s]}</option>)}
                      </select>
                      <input list="resp-at" defaultValue={a.responsavel ?? ''} placeholder="responsável" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.responsavel ?? '')) patch(a.id, { responsavel: v }); }}
                        className="input-aura" style={{ width: 150, padding: '5px 8px', fontSize: 12 }} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      <datalist id="resp-at">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
      {novo && <NovoModal nomes={nomes} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
      {aberto && <ConversaDrawer id={aberto} onClose={() => { setAberto(null); load(); }} />}
    </div>
  );
}

function ConversaDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${API}/api/v1/atendimentos/${id}`, { headers: authHeaders() });
    if (r.ok) setData(await r.json());
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await fetch(`${API}/api/v1/atendimentos/${id}/responder`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ texto }) });
      const d = await r.json();
      if (d.dev) alert('Mensagem registrada. (WhatsApp em modo dev — configure as chaves p/ envio real.)');
      setTexto(''); load();
    } finally { setEnviando(false); }
  }

  const at = data?.atendimento;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,25,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '95vw', height: '100%', background: 'var(--surface2)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{at?.clienteNome ?? '—'}</strong>
            <div style={{ fontSize: 12, color: 'var(--faint)' }}>{at?.contato} · {at?.canal}</div>
          </div>
          <X size={18} style={{ cursor: 'pointer', color: 'var(--faint)' }} onClick={onClose} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!data ? <Spinner pad={40} /> :
            data.mensagens.length === 0 ? <EmptyState icon={<MessageCircle size={24} />} title="Sem mensagens registradas ainda." /> :
            data.mensagens.map((m: any) => (
              <div key={m.id} style={{ alignSelf: m.direcao === 'out' ? 'flex-end' : 'flex-start', maxWidth: '80%', background: m.direcao === 'out' ? 'var(--acao)' : 'var(--surface)', color: m.direcao === 'out' ? '#fff' : 'var(--tx)', padding: '8px 12px', borderRadius: 12, fontSize: 13 }}>
                {m.texto}
                <div style={{ fontSize: 10, color: m.direcao === 'out' ? '#c7d2fe' : 'var(--faint)', marginTop: 3 }}>{m.autor ?? (m.direcao === 'in' ? 'Cliente' : '')} · {new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8 }}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()} placeholder="Responder ao cliente…"
            className="input-aura" style={{ flex: 1 }} />
          <button onClick={enviar} disabled={enviando} className="btn-primary">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
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
  const inp = (k: string, ph: string) => <input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="input-aura w-full" style={{ marginBottom: 8 }} />;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,25,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card border border-line rounded-xl shadow-pop" style={{ padding: 22, width: 440, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 15 }}>Novo atendimento</strong>
          <X size={18} style={{ cursor: 'pointer', color: 'var(--faint)' }} onClick={onClose} />
        </div>
        {inp('clienteNome', 'Cliente')}
        {inp('assunto', 'Assunto')}
        {inp('mensagem', 'Descrição / dúvida')}
        {inp('contato', 'Contato (telefone/e-mail)')}
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className="input-aura" style={{ flex: 1 }}>
            {['fiscal', 'contabil', 'folha', 'financeiro', 'outro'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })} className="input-aura" style={{ flex: 1 }}>
            {['baixa', 'normal', 'alta', 'urgente'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <input list="resp-at" value={f.responsavel ?? ''} onChange={(e) => setF({ ...f, responsavel: e.target.value })} placeholder="responsável" className="input-aura w-full" style={{ marginTop: 8 }} />
        <button onClick={salvar} disabled={busy} className="btn-primary w-full justify-center" style={{ marginTop: 14 }}>
          {busy ? 'Salvando…' : 'Criar atendimento'}
        </button>
      </div>
    </div>
  );
}
function Chip({ on, cor = 'var(--acao)', onClick, children }: any) {
  return <button onClick={onClick} style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${on ? cor : 'var(--border)'}`, background: on ? tint(cor, 13) : 'var(--surface2)', color: on ? cor : 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>{children}</button>;
}
