'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, AlertTriangle, Clock, FileText, Receipt, Wallet, MessageCircle,
  Headphones, RefreshCw, LogOut, ChevronRight, X, Send, Loader2, Building2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const BRL = (n: any) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

const CORS: Record<string, { bg: string; fg: string; brd: string }> = {
  verde:    { bg: 'rgba(62,224,160,.12)', fg: '#3ee0a0', brd: 'rgba(62,224,160,.35)' },
  amarelo:  { bg: 'rgba(255,194,71,.12)', fg: '#ffc247', brd: 'rgba(255,194,71,.35)' },
  vermelho: { bg: 'rgba(255,107,107,.12)', fg: '#ff6b6b', brd: 'rgba(255,107,107,.4)' },
};

export default function MeuEscritorioPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [chamadoOpen, setChamadoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const r = await fetch(`${API}/api/v1/meu-painel`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.message ?? 'Não foi possível carregar.'); }
      setD(await r.json());
    } catch (e: any) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sair = () => { logout(); router.replace('/login'); };

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={26} className="animate-spin" style={{ color: 'var(--acao)' }} />
    </div>
  );

  if (erro || !d) return (
    <div style={{ padding: 24, textAlign: 'center', paddingTop: 80 }}>
      <AlertTriangle size={30} style={{ color: '#ff6b6b', margin: '0 auto 10px' }} />
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>{erro || 'Sem dados.'}</p>
      <button onClick={load} style={{ marginTop: 14, padding: '9px 18px', borderRadius: 10, background: 'var(--acao)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600 }}>Tentar de novo</button>
      <button onClick={sair} style={{ marginTop: 10, display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--faint)', fontSize: 13 }}>Sair</button>
    </div>
  );

  const st = CORS[d.status?.cor] ?? CORS.amarelo;
  const wpp = d.contato?.whatsapp;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 96 }}>
      {/* Header app-like */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--acao)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building2 size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.empresa?.nome}</div>
          <div style={{ fontSize: 11, color: 'var(--faint)' }}>{d.empresa?.regime?.replace(/_/g, ' ') ?? ''} · {d.empresa?.cnpj}</div>
        </div>
        <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--faint)', padding: 6 }}><RefreshCw size={17} /></button>
        <button onClick={sair} style={{ background: 'none', border: 'none', color: 'var(--faint)', padding: 6 }}><LogOut size={17} /></button>
      </header>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Status grande */}
        <div style={{ background: st.bg, border: `1px solid ${st.brd}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {d.status?.cor === 'verde' ? <CheckCircle2 size={26} color={st.fg} /> : d.status?.cor === 'vermelho' ? <AlertTriangle size={26} color={st.fg} /> : <Clock size={26} color={st.fg} />}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: st.fg }}>{d.status?.titulo}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{d.status?.resumo}</div>
            </div>
          </div>
        </div>

        {/* Pendências do cliente */}
        {(d.pendencias?.length ?? 0) > 0 && (
          <Section title="O que falta de você" icon={<AlertTriangle size={15} color="#ffc247" />}>
            {d.pendencias.map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: p.prioridade === 'alta' ? '#ff6b6b' : '#ffc247', marginTop: 6, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: 'var(--tx-strong)', lineHeight: 1.4 }}>{p.texto}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Guias / impostos do mês */}
        <Section title={`Guias e impostos · ${mesTxt(d.competencia)}`} icon={<Receipt size={15} color="var(--acao)" />}
          extra={`${d.guias?.vencidas ? d.guias.vencidas + ' vencida(s) · ' : ''}${d.guias?.aVencer ?? 0} a vencer`}>
          {(d.guias?.itens?.length ?? 0) === 0 && <Vazio texto="Nenhuma guia gerada para o mês ainda." />}
          {d.guias?.itens?.map((g: any, i: number) => {
            const c = g.situacao === 'vencida' ? '#ff6b6b' : g.situacao === 'paga' ? '#3ee0a0' : 'var(--muted)';
            return (
              <Linha key={i}
                titulo={g.nome} sub={`vence ${dataBR(g.vencimento)}`}
                valor={BRL(g.valor)}
                chip={g.situacao === 'vencida' ? 'Vencida' : g.situacao === 'paga' ? 'Paga' : 'A vencer'} chipCor={c} />
            );
          })}
        </Section>

        {/* Honorários */}
        <Section title="Honorários" icon={<Wallet size={15} color="var(--acao)" />}
          extra={d.honorarios?.totalAtrasado > 0 ? `${BRL(d.honorarios.totalAtrasado)} em atraso` : d.honorarios?.totalPendente > 0 ? `${BRL(d.honorarios.totalPendente)} a pagar` : 'em dia'}>
          {(d.honorarios?.itens?.length ?? 0) === 0 && <Vazio texto="Nada pendente com o escritório. 👍" />}
          {d.honorarios?.itens?.map((h: any, i: number) => (
            <Linha key={i} titulo={h.descricao} sub={`vence ${dataBR(h.vencimento)}`} valor={BRL(h.valor)}
              chip={h.atrasado ? 'Atrasado' : 'A pagar'} chipCor={h.atrasado ? '#ff6b6b' : 'var(--muted)'} />
          ))}
        </Section>

        {/* Documentos */}
        <Section title="Documentos do mês" icon={<FileText size={15} color="var(--acao)" />}
          extra={`${d.documentos?.totalMes ?? 0} nota(s) · ${BRL(d.documentos?.valorMes)}`}>
          {(d.documentos?.recentes?.length ?? 0) === 0 && <Vazio texto="Nenhuma nota capturada neste mês." />}
          {d.documentos?.recentes?.map((r: any, i: number) => (
            <Linha key={i} titulo={r.nome} sub={`${(r.tipo ?? '').toUpperCase()} · ${dataBR(r.em)}`} valor={BRL(r.valor)} />
          ))}
          {d.documentos?.comInconsistencia > 0 && (
            <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Clock size={12} /> {d.documentos.comInconsistencia} nota(s) em verificação pelo escritório.
            </p>
          )}
        </Section>

        {d.atualizadoEm && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>
            atualizado {new Date(d.atualizadoEm).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>

      {/* Barra de contato fixa */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', display: 'flex', gap: 10, maxWidth: 520, margin: '0 auto' }}>
        {wpp && (
          <a href={`https://wa.me/${String(wpp).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Sou da ${d.empresa?.nome}.`)}`} target="_blank" rel="noreferrer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 12, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            <MessageCircle size={18} /> WhatsApp
          </a>
        )}
        <button onClick={() => setChamadoOpen(true)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', borderRadius: 12, background: 'var(--acao)', color: '#fff', fontWeight: 700, fontSize: 14, border: 'none' }}>
          <Headphones size={18} /> Abrir chamado
        </button>
      </div>

      {chamadoOpen && <ChamadoSheet onClose={() => setChamadoOpen(false)} />}
    </div>
  );
}

function Section({ title, icon, extra, children }: any) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        {icon}
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-strong)', margin: 0 }}>{title}</h2>
        {extra && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>{extra}</span>}
      </div>
      {children}
    </div>
  );
}

function Linha({ titulo, sub, valor, chip, chipCor }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="num" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx-strong)' }}>{valor}</div>
        {chip && <div style={{ fontSize: 10.5, fontWeight: 600, color: chipCor }}>{chip}</div>}
      </div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: 12.5, color: 'var(--faint)', padding: '6px 2px' }}>{texto}</p>;
}

function mesTxt(comp?: string) {
  if (!comp) return '';
  const [y, m] = comp.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

function ChamadoSheet({ onClose }: { onClose: () => void }) {
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  async function enviar() {
    if (!mensagem.trim()) return;
    setEnviando(true);
    try {
      const r = await fetch(`${API}/api/v1/meu-painel/chamado`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ assunto: assunto || undefined, mensagem }),
      });
      if (r.ok) { setOk(true); setTimeout(onClose, 1400); }
    } catch {} finally { setEnviando(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--surface)', borderRadius: '18px 18px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-strong)', margin: 0 }}>Abrir chamado</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--faint)' }}><X size={20} /></button>
        </div>
        {ok ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 size={34} color="#3ee0a0" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--tx-strong)', fontWeight: 600 }}>Chamado enviado!</p>
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>O escritório vai te responder.</p>
          </div>
        ) : (
          <>
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto (opcional)"
              style={inp} />
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva sua mensagem para o escritório…" rows={4}
              style={{ ...inp, resize: 'none' }} />
            <button onClick={enviar} disabled={enviando || !mensagem.trim()}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, background: 'var(--acao)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', opacity: mensagem.trim() ? 1 : 0.5 }}>
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <><Send size={17} /> Enviar</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', marginBottom: 10, borderRadius: 12,
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--tx-strong)', fontSize: 14,
};
