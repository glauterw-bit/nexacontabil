'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Send, X, FileText, ArrowRight, Download, Loader2, Bot } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { COLORS, tint } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '';

interface Turno {
  quem: 'user' | 'assistente';
  texto: string;
  acao?: any;
}

const SUGESTOES = [
  'Abrir os faróis',
  'Notas com erro da Elétrica DJ',
  'Situação da carteira',
  'Como apurar o DAS do Simples?',
];

export function Assistente() {
  const router = useRouter();
  const { selectedCompany } = useCompany();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turnos, carregando]);
  useEffect(() => { if (aberto) setTimeout(() => inputRef.current?.focus(), 60); }, [aberto]);

  // Atalho global: Ctrl/Cmd + J abre o assistente
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAberto((v) => !v); }
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const enviar = useCallback(async (msg?: string) => {
    const mensagem = (msg ?? texto).trim();
    if (!mensagem || carregando) return;
    setTexto('');
    setTurnos((t) => [...t, { quem: 'user', texto: mensagem }]);
    setCarregando(true);
    try {
      const historico = turnos.slice(-6).map((t) => ({ role: t.quem === 'user' ? 'user' : 'assistant', content: t.texto }));
      const r = await fetch(`${API}/api/v1/assistente/comando`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ mensagem, companyId: selectedCompany?.id, historico }),
      });
      const a = r.ok ? await r.json() : null;
      if (!a) { setTurnos((t) => [...t, { quem: 'assistente', texto: 'Não consegui processar agora. Tente de novo.' }]); return; }
      setTurnos((t) => [...t, { quem: 'assistente', texto: a.fala, acao: a }]);
      // Navegação: leva à tela e fecha o painel
      if (a.tipo === 'navegar' && a.rota) {
        setTimeout(() => { router.push(a.rota); setAberto(false); }, 500);
      }
    } catch {
      setTurnos((t) => [...t, { quem: 'assistente', texto: 'Erro de conexão com o assistente.' }]);
    } finally { setCarregando(false); }
  }, [texto, carregando, turnos, selectedCompany, router]);

  const baixar = useCallback(async (id: string, nome?: string) => {
    try {
      const r = await fetch(`${API}/api/v1/busca-docs/download/${id}`, { headers: authHeaders() });
      if (!r.ok) return;
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = nome || 'documento.xml';
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch {}
  }, []);

  return (
    <>
      {/* Botão flutuante */}
      {!aberto && (
        <button onClick={() => setAberto(true)} aria-label="Abrir assistente (Ctrl+J)"
          style={{
            position: 'fixed', right: 22, bottom: 22, zIndex: 55, height: 54, width: 54, borderRadius: 16,
            border: 'none', cursor: 'pointer', color: '#fff',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            boxShadow: `0 8px 24px ${tint(COLORS.acao, 45)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Sparkles size={22} />
        </button>
      )}

      {aberto && (
        <div style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 56, width: 420, maxWidth: 'calc(100vw - 32px)',
          height: 560, maxHeight: 'calc(100vh - 40px)', background: COLORS.surface,
          border: `1px solid ${COLORS.border}`, borderRadius: 18, boxShadow: 'var(--shadow-pop)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Cabeçalho */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${COLORS.border}`,
            backgroundImage: `linear-gradient(135deg, ${tint(COLORS.acao, 12)}, transparent 60%)` }}>
            <div style={{ height: 30, width: 30, borderRadius: 9, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.strong }}>Assistente DomoSYS</div>
              <div style={{ fontSize: 11, color: COLORS.faint }}>Peça uma tela, um documento ou uma dúvida contábil</div>
            </div>
            <button onClick={() => setAberto(false)} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.faint, padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Conversa */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {turnos.length === 0 && (
              <div style={{ color: COLORS.muted, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: COLORS.strong, fontWeight: 600 }}>
                  <Bot size={17} color={COLORS.acao} /> Como posso ajudar?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SUGESTOES.map((s) => (
                    <button key={s} onClick={() => enviar(s)}
                      style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.text, fontSize: 12.5, cursor: 'pointer' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turnos.map((t, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: t.quem === 'user' ? 'flex-end' : 'flex-start', gap: 8 }}>
                <div style={{
                  maxWidth: '88%', padding: '9px 13px', borderRadius: 13, fontSize: 13, lineHeight: 1.5,
                  background: t.quem === 'user' ? COLORS.acao : COLORS.surface2,
                  color: t.quem === 'user' ? '#fff' : COLORS.text,
                  border: t.quem === 'user' ? 'none' : `1px solid ${COLORS.border}`,
                  whiteSpace: 'pre-wrap',
                }}>
                  {t.texto}
                </div>

                {/* Ação: navegar */}
                {t.acao?.tipo === 'navegar' && t.acao.rota && (
                  <button onClick={() => { router.push(t.acao.rota); setAberto(false); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${tint(COLORS.acao, 40)}`, background: tint(COLORS.acao, 12), color: COLORS.acao, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Abrir tela <ArrowRight size={14} />
                  </button>
                )}

                {/* Ação: documentos */}
                {t.acao?.tipo === 'documentos' && (t.acao.documentos?.length ?? 0) > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {t.acao.documentos.slice(0, 12).map((d: any) => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, fontSize: 12 }}>
                        <FileText size={15} color={d.inconsistencias?.length ? COLORS.erro : COLORS.faint} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.emitente || d.cliente || d.arquivo || `NF ${d.numero ?? ''}`}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.faint }}>
                            {(d.tipo || 'doc').toUpperCase()}{d.numero ? ` · nº ${d.numero}` : ''}{d.data ? ` · ${dataBR(d.data)}` : ''}
                            {d.inconsistencias?.length ? ` · ${d.inconsistencias.length} erro(s)` : ''}
                          </div>
                        </div>
                        {d.valor != null && <span className="num" style={{ color: COLORS.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{BRL(d.valor)}</span>}
                        <button onClick={() => baixar(d.id, d.arquivo)} title="Baixar XML"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.acao, padding: 3, flexShrink: 0 }}>
                          <Download size={15} />
                        </button>
                      </div>
                    ))}
                    {t.acao.total > 12 && (
                      <div style={{ fontSize: 11, color: COLORS.faint, textAlign: 'center' }}>
                        + {t.acao.total - 12} outros · <button onClick={() => { router.push('/buscar-docs'); setAberto(false); }} style={{ border: 'none', background: 'transparent', color: COLORS.acao, cursor: 'pointer', fontSize: 11 }}>ver todos na busca</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {carregando && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.muted, fontSize: 12.5 }}>
                <Loader2 size={15} className="animate-spin" /> pensando…
              </div>
            )}
            <div ref={fimRef} />
          </div>

          {/* Entrada */}
          <div style={{ padding: 12, borderTop: `1px solid ${COLORS.border}`, display: 'flex', gap: 8 }}>
            <input ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
              placeholder="Ex.: abrir faróis · notas da Gesso Mix · como apurar o DAS"
              className="input-aura" style={{ flex: 1, fontSize: 13 }} />
            <button onClick={() => enviar()} disabled={carregando || !texto.trim()}
              style={{ height: 40, width: 44, borderRadius: 10, border: 'none', cursor: texto.trim() ? 'pointer' : 'not-allowed', background: COLORS.acao, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: texto.trim() ? 1 : 0.5 }}>
              <Send size={17} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
