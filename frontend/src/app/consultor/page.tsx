'use client';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, StatusChip } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const EXEMPLOS = [
  'Última nota da Clínica Owen',
  'Notas da Mafer com imposto errado',
  'Quanto a Auto Peças Lico Maia emitiu este mês?',
  'Documentos com inconsistência fiscal',
];

interface Msg { role: 'user' | 'assistant'; content: string; docs?: any[]; resumo?: any; }

export default function ConsultorPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, carregando]);

  async function enviar(texto?: string) {
    const q = (texto ?? pergunta).trim();
    if (!q || carregando) return;
    const historico = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    setPergunta('');
    setCarregando(true);
    try {
      const r = await fetch(`${API}/api/v1/consultor/perguntar`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ pergunta: q, historico }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Falha');
      setMsgs((m) => [...m, { role: 'assistant', content: d.resposta, docs: d.documentos, resumo: d.resumo }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Não consegui responder agora (${e.message}).` }]);
    } finally { setCarregando(false); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 40px)' }}>
      <PageHeader
        icon={<Sparkles size={20} color={COLORS.acao} />}
        title="Consultor de Documentos"
        subtitle="Peça um documento em português — a IA encontra e já te dá a análise fiscal"
      />

      {msgs.length === 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 12 }}>Experimente perguntar:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXEMPLOS.map((ex) => (
              <button key={ex} onClick={() => enviar(ex)} style={{
                fontSize: 12.5, color: COLORS.text, background: tint(COLORS.acao, 8), border: `1px solid ${tint(COLORS.acao, 22)}`,
                borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
              }}>{ex}</button>
            ))}
          </div>
        </Card>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '90%' }}>
              <div style={{
                background: m.role === 'user' ? COLORS.acao : COLORS.surface,
                color: m.role === 'user' ? '#fff' : COLORS.text,
                border: m.role === 'user' ? 'none' : `1px solid ${COLORS.border}`,
                borderRadius: 14, padding: '11px 15px', fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}>{m.content}</div>

              {/* documentos encontrados */}
              {m.role === 'assistant' && (m.docs?.length ?? 0) > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {m.resumo && (
                    <div style={{ fontSize: 11.5, color: COLORS.muted }}>
                      {m.resumo.encontrados} de {m.resumo.totalDisponivel} · R$ {Number(m.resumo.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {m.resumo.comInconsistencia > 0 && <span style={{ color: COLORS.erro }}> · {m.resumo.comInconsistencia} com inconsistência</span>}
                    </div>
                  )}
                  {m.docs!.slice(0, 8).map((d: any) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: COLORS.surface2, borderRadius: 10, padding: '8px 12px' }}>
                      <FileText size={15} color={COLORS.muted} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: COLORS.strong, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.cliente} · {d.tipo?.toUpperCase()} {d.numero ? `nº ${d.numero}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.faint }}>
                          {d.emitente ?? ''}{d.data ? ` · ${new Date(d.data).toLocaleDateString('pt-BR')}` : ''}{d.valor ? ` · R$ ${Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                        </div>
                      </div>
                      {(d.inconsistencias?.length ?? 0) > 0
                        ? <StatusChip tone="critico" label={`${d.inconsistencias.length} erro(s)`} size="sm" />
                        : <CheckCircle2 size={15} color={COLORS.ok} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {carregando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.muted, fontSize: 13 }}>
            <Loader2 size={15} className="animate-spin" /> procurando e analisando…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* caixa de pergunta */}
      <div style={{ position: 'sticky', bottom: 0, paddingTop: 12, background: COLORS.bg }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 10px 8px 14px' }}>
          <input
            value={pergunta} onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviar(); }}
            placeholder="Ex.: me traz a última nota da Clínica Owen…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: COLORS.text }}
          />
          <button onClick={() => enviar()} disabled={carregando || !pergunta.trim()} className="btn-primary"
            style={{ display: 'inline-flex', gap: 6, fontSize: 13, opacity: carregando || !pergunta.trim() ? 0.5 : 1 }}>
            <Send size={14} /> Enviar
          </button>
        </div>
        <p style={{ fontSize: 11, color: COLORS.faint, textAlign: 'center', marginTop: 6 }}>
          A IA busca no acervo real de documentos dos clientes e analisa inconsistências fiscais.
        </p>
      </div>
    </div>
  );
}
