'use client';
import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
type Doc = { id: string; nome?: string; pasta?: string; tipo?: string; valor?: number; data?: string };
type Msg = { role: 'user' | 'assistant'; texto: string; docs?: Doc[]; abrir?: string | null };

const SUGESTOES = [
  'Acha o DAS de junho da Clínica Owen',
  'Analisa o DAS mais recente do #113',
  'Notas fiscais de maio do Gesso Mix',
  'Confere o DCTFWeb de abril da Pisom',
];

export default function Assistente() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'assistant', texto: 'Oi! Sou o assistente da sua carteira. Me peça pra **localizar** um documento ("acha o DAS de junho da Clínica Owen") ou pra **analisar** ("analisa esse DAS") — eu busco no acervo e leio o conteúdo pra você.' }]);
  const [input, setInput] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, ocupado]);

  const enviar = async (texto?: string) => {
    const t = (texto ?? input).trim();
    if (!t || ocupado) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', texto: t }]);
    setOcupado(true);
    try {
      const r = await fetch(`${API}/api/v1/assistente/chat`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ mensagem: t, historico: msgs.slice(-6).map((m) => ({ role: m.role, content: m.texto })) }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, { role: 'assistant', texto: j.resposta ?? 'Não consegui responder.', docs: j.docs ?? [], abrir: j.abrir ?? null }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', texto: 'Erro de rede — tenta de novo.' }]);
    } finally { setOcupado(false); }
  };

  const analisarDoc = async (doc: Doc) => {
    if (ocupado) return;
    setMsgs((m) => [...m, { role: 'user', texto: `Analisa: ${doc.nome}` }]);
    setOcupado(true);
    try {
      const r = await fetch(`${API}/api/v1/assistente/analisar`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ docId: doc.id }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, { role: 'assistant', texto: j.erro ? `Não deu: ${j.erro}` : `**Análise de ${j.doc?.nome ?? doc.nome}:**\n${j.analise}` }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', texto: 'Erro na análise — tenta de novo.' }]);
    } finally { setOcupado(false); }
  };

  const md = (s: string) => s.split('**').map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>));

  return (
    <div className="as-wrap">
      <header className="as-head">
        <h1>🤖 Assistente da carteira</h1>
        <p>Localiza documentos dos seus clientes e analisa o conteúdo com IA — direto no chat.</p>
      </header>

      <div className="as-chat">
        {msgs.map((m, i) => (
          <div key={i} className={`as-msg ${m.role}`}>
            <div className="as-bolha">
              <div className="as-texto">{m.texto.split('\n').map((l, k) => <p key={k}>{md(l)}</p>)}</div>
              {m.docs && m.docs.length > 0 && (
                <div className="as-docs">
                  {m.docs.map((d) => (
                    <div key={d.id} className="as-doc">
                      <div className="as-doc-info">
                        <b title={d.nome}>{d.nome ?? 'documento'}</b>
                        <small>{d.pasta ? d.pasta.split('/').slice(-2).join('/') + ' · ' : ''}{d.valor ? `R$ ${Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : d.tipo ?? ''}</small>
                      </div>
                      <button onClick={() => analisarDoc(d)} disabled={ocupado}>🔍 Analisar</button>
                    </div>
                  ))}
                </div>
              )}
              {m.abrir ? <a className="as-abrir" href={m.abrir} target="_blank" rel="noopener">Abrir comprovante no OneDrive ↗</a> : null}
            </div>
          </div>
        ))}
        {ocupado && <div className="as-msg assistant"><div className="as-bolha as-dig">analisando<span className="d">.</span><span className="d">.</span><span className="d">.</span></div></div>}
        <div ref={fim} />
      </div>

      {msgs.length <= 1 && (
        <div className="as-sug">{SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}</div>
      )}

      <div className="as-input">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder='Ex.: "acha o DAS de junho da Clínica Owen e analisa"' disabled={ocupado} />
        <button onClick={() => enviar()} disabled={ocupado || !input.trim()}>Enviar</button>
      </div>

      <style jsx global>{`
.as-wrap{max-width:760px;margin:0 auto;padding:22px 22px 30px;color:#1C1917;font-size:14px;display:flex;flex-direction:column;height:calc(100vh - 40px)}
.as-head h1{font-size:20px;font-weight:700}
.as-head p{color:#57534E;margin-top:4px}
.as-chat{flex:1;overflow-y:auto;margin:18px 0 10px;display:flex;flex-direction:column;gap:10px;padding-right:4px}
.as-msg{display:flex}
.as-msg.user{justify-content:flex-end}
.as-bolha{max-width:86%;border-radius:16px;padding:12px 15px;line-height:1.55;background:#fff;border:1px solid #E7E5E4}
.as-msg.user .as-bolha{background:#0F766E;color:#fff;border-color:#0F766E}
.as-texto p{margin:2px 0}
.as-docs{margin-top:10px;display:flex;flex-direction:column;gap:7px}
.as-doc{display:flex;align-items:center;gap:10px;background:#F5F5F4;border:1px solid #E7E5E4;border-radius:11px;padding:9px 12px}
.as-doc-info{flex:1;min-width:0}
.as-doc-info b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px}
.as-doc-info small{color:#8A857E;font-size:11.5px}
.as-doc button{border:1px solid #0F766E;background:#E6F1EF;color:#0F766E;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.as-doc button:disabled{opacity:.5}
.as-abrir{display:inline-block;margin-top:9px;color:#0F766E;font-weight:600;font-size:13px;text-decoration:none}
.as-dig{color:#8A857E}
.as-dig .d{animation:aspulse 1.2s infinite}
.as-dig .d:nth-child(2){animation-delay:.2s}.as-dig .d:nth-child(3){animation-delay:.4s}
@keyframes aspulse{0%,100%{opacity:.2}50%{opacity:1}}
.as-sug{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.as-sug button{border:1px solid #E7E5E4;background:#fff;border-radius:20px;padding:8px 14px;font-size:12.5px;color:#57534E;cursor:pointer}
.as-sug button:hover{border-color:#0F766E;color:#0F766E}
.as-input{display:flex;gap:9px}
.as-input input{flex:1;border:1px solid #E7E5E4;border-radius:12px;padding:12px 15px;font-size:14px;outline:none}
.as-input input:focus{border-color:#0F766E}
.as-input button{border:none;background:#0F766E;color:#fff;border-radius:12px;padding:12px 22px;font-size:14px;font-weight:600;cursor:pointer}
.as-input button:disabled{opacity:.5}
      `}</style>
    </div>
  );
}
