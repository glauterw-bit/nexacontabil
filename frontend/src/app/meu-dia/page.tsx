'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MESL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
type Cli = { companyId: string; cliente: string; codigo?: string; regime?: string; tipo: string; faltam: number; mesesFaltantes: number[] };
type Dados = { ano: number; clientes: Cli[] };
type Prazos = { total: number; atrasadas: number; proximas7dias: number; entregues: number; timeline: { data: string; tipos: { type: string; total: number; atrasadas: number }[] }[] };
type Desemp = { analistas: { responsavel: string; clientes: number; entregues: number; devidas: number; taxa: number; atrasados: number }[] };
const META = 95;

function useCountUp(target: number, dur = 850) {
  const [v, setV] = useState(0); const raf = useRef<number>();
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / dur); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick); return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, dur]);
  return v;
}
function Num({ value, suf = '' }: { value: number; suf?: string }) { const v = useCountUp(value); return <>{Math.round(v).toLocaleString('pt-BR')}{suf}</>; }

function Gauge({ pct }: { pct: number }) {
  const size = 96, r = 40, c = 2 * Math.PI * r;
  const [dash, setDash] = useState(c);
  useEffect(() => { const id = setTimeout(() => setDash(c * (1 - Math.min(1, pct / 100))), 120); return () => clearTimeout(id); }, [pct, c]);
  const tone = pct >= META ? 'var(--ok)' : pct >= 70 ? 'var(--atencao)' : 'var(--erro)';
  return (
    <svg width={size} height={size} className="md-gauge">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={8} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={dash} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }} />
      <text x="50%" y="52%" textAnchor="middle" className="md-gauge-n" fill={tone}>{Math.round(pct)}%</text>
    </svg>
  );
}

export default function MeuDia() {
  const { user } = useAuth();
  const [d, setD] = useState<Dados | null>(null);
  const [pz, setPz] = useState<Prazos | null>(null);
  const [meu, setMeu] = useState<Desemp['analistas'][0] | null>(null);
  const [loading, setLoading] = useState(true);
  const ano = new Date().getFullYear();
  const [cob, setCob] = useState<Record<string, any>>({});
  const [copiado, setCopiado] = useState('');
  const [gateway, setGateway] = useState<string | null>(null);
  const [enviando, setEnviando] = useState('');

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/gateway-whatsapp`, { headers: authHeaders() }).then((r) => r.json()).then((j) => setGateway(j?.gateway ?? null)).catch(() => setGateway(null));
    fetch(`${API}/api/v1/paineis/prazos`, { headers: authHeaders() }).then((r) => r.json()).then(setPz).catch(() => setPz(null));
  }, []);
  useEffect(() => {
    if (!user?.name) return;
    fetch(`${API}/api/v1/paineis/desempenho-analistas?ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then((j: Desemp) => setMeu((j.analistas || []).find((a) => a.responsavel === user.name) || null)).catch(() => {});
  }, [user?.name, ano]);

  const enviarAgora = async (companyId: string) => {
    setEnviando(companyId);
    try {
      const r = await fetch(`${API}/api/v1/paineis/enviar-cobranca`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ companyId }) });
      const j = await r.json();
      setCob((p) => ({ ...p, [companyId]: { ...p[companyId], envioResultado: j.ok ? '✓ enviada pelo sistema' : `não enviada: ${j.motivo || 'falha'}`, ultimaCobranca: j.ok ? { canal: 'whatsapp-auto', diasAtras: 0 } : p[companyId]?.ultimaCobranca } }));
    } catch { setCob((p) => ({ ...p, [companyId]: { ...p[companyId], envioResultado: 'não enviada: erro de rede' } })); }
    finally { setEnviando(''); }
  };
  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/paineis/recibos-faltantes?ano=${ano}`, { headers: authHeaders() }).then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const gerar = async (companyId: string) => {
    if (cob[companyId]) { setCob((p) => ({ ...p, [companyId]: null })); return; }
    setCob((p) => ({ ...p, [companyId]: { loading: true } }));
    try {
      const r = await fetch(`${API}/api/v1/paineis/cobranca-cliente?companyId=${companyId}&ano=${ano}`, { headers: authHeaders() });
      const j = await r.json();
      setCob((p) => ({ ...p, [companyId]: j }));
    } catch { setCob((p) => ({ ...p, [companyId]: { erro: true } })); }
  };
  const copiar = async (id: string, msg: string) => { try { await navigator.clipboard.writeText(msg); setCopiado(id); setTimeout(() => setCopiado(''), 1800); registrar(id, 'copiar'); } catch {} };
  const registrar = (companyId: string, canal: string) => {
    const cb = cob[companyId]; if (!cb?.totalFaltam) return;
    const comps = (cb.faltam || []).map((f: any) => f.rotulo).join(', ');
    fetch(`${API}/api/v1/paineis/registrar-cobranca`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ companyId, canal, competencias: comps, quantidade: cb.totalFaltam }) })
      .then(() => setCob((p) => ({ ...p, [companyId]: { ...p[companyId], ultimaCobranca: { canal, diasAtras: 0 } } }))).catch(() => {});
  };

  const comFalta = (d?.clientes ?? []).filter((c) => c.faltam > 0);
  const totFalta = comFalta.reduce((s, c) => s + c.faltam, 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const proximos = (pz?.timeline ?? []).filter((t) => t.data >= hoje).slice(0, 4);
  const taxa = meu?.taxa ?? 0;
  const primeiro = (user?.name || '').split(' ')[0];

  return (
    <div className="md-wrap">
      <header className="md-head">
        <h1>☀️ Meu Dia{primeiro ? `, ${primeiro}` : ''}</h1>
        <p>Sua carteira num olhar: desempenho, o que vence e quem cobrar. Quando o recibo sobe ao OneDrive, some daqui sozinho.</p>
      </header>

      {/* RESUMO — desempenho + prazos */}
      <section className="md-top">
        <div className="md-perf">
          <Gauge pct={taxa} />
          <div className="md-perf-txt">
            <span className="md-perf-lbl">Minha taxa de entrega</span>
            <b className="md-perf-sub">{meu ? `${meu.entregues}/${meu.devidas} obrigações` : '—'}</b>
            <span className={`md-meta ${taxa >= META ? 'ok' : ''}`}>{taxa >= META ? '🎯 meta batida!' : `faltam ${Math.max(0, META - Math.round(taxa))} pts p/ a meta (${META}%)`}</span>
          </div>
        </div>
        <div className="md-mini md-mini-r"><b><Num value={pz?.atrasadas ?? 0} /></b><span>atrasadas</span></div>
        <div className="md-mini md-mini-a"><b><Num value={pz?.proximas7dias ?? 0} /></b><span>vencem em 7 dias</span></div>
        <div className="md-mini md-mini-c"><b><Num value={comFalta.length} /></b><span>clientes a cobrar</span></div>
      </section>

      {proximos.length > 0 && (
        <section className="md-prox">
          <h2>Próximos vencimentos</h2>
          <div className="md-prox-list">
            {proximos.map((t) => {
              const dt = new Date(t.data + 'T00:00'); const tot = t.tipos.reduce((s, x) => s + x.total, 0);
              return (
                <div key={t.data} className="md-prox-item">
                  <div className="md-prox-dia"><b>{dt.getDate()}</b><span>{MESL[dt.getMonth()]}</span></div>
                  <div className="md-prox-info">
                    <b>{tot} obrigações</b>
                    <small>{t.tipos.slice(0, 4).map((x) => x.type).join(' · ')}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loading ? <div className="md-load"><span className="md-spin" />carregando sua carteira…</div> : !d ? <div className="md-load">Sem dados.</div> : (
        <section className="md-fila">
          <h2>Fila de cobrança <span className="md-cnt">{totFalta} docs · {comFalta.length} clientes</span></h2>
          {comFalta.length === 0 ? (
            <div className="md-zero">🎉 Sua carteira está 100% em dia. Nada a cobrar hoje!</div>
          ) : (
            <ul className="md-list">
              {comFalta.map((c) => {
                const cb = cob[c.companyId];
                return (
                  <li key={c.companyId} className="md-item">
                    <div className="md-row">
                      <div className="md-cli"><b>{c.cliente}</b><small>{c.codigo ? `#${c.codigo} · ` : ''}{c.regime} · {c.tipo}</small></div>
                      <div className="md-meses">{c.mesesFaltantes.map((m) => <span key={m} className="md-tag">{MESL[m - 1]}</span>)}</div>
                      <button className="md-cobrar" onClick={() => gerar(c.companyId)}>{cb ? 'Fechar' : `Cobrar (${c.faltam})`}</button>
                    </div>
                    {cb && !cb.loading && !cb.erro && (
                      <div className="md-cob">
                        {cb.ultimaCobranca ? <div className="md-ja">já cobrado {cb.ultimaCobranca.diasAtras === 0 ? 'hoje' : `há ${cb.ultimaCobranca.diasAtras}d`}</div> : null}
                        <textarea readOnly value={cb.mensagem} rows={5} />
                        <div className="md-acts">
                          {gateway && cb.whatsapp ? <button className="md-wa" disabled={enviando === c.companyId} onClick={() => enviarAgora(c.companyId)}>{enviando === c.companyId ? 'Enviando…' : '📤 Enviar agora'}</button> : null}
                          {cb.whatsapp ? <a className="md-wa" href={cb.whatsapp} target="_blank" rel="noopener" onClick={() => registrar(c.companyId, 'whatsapp')}>WhatsApp ↗</a> : <span className="md-wa off">sem WhatsApp</span>}
                          <button className="md-copy" onClick={() => copiar(c.companyId, cb.mensagem)}>{copiado === c.companyId ? '✓ copiado' : 'Copiar'}</button>
                          {cb.email ? <a className="md-copy" href={`mailto:${cb.email}?subject=${encodeURIComponent('Documentos pendentes')}&body=${encodeURIComponent(cb.mensagem)}`} onClick={() => registrar(c.companyId, 'email')}>E-mail</a> : null}
                          {cb.envioResultado ? <span className="md-envio">{cb.envioResultado}</span> : null}
                        </div>
                      </div>
                    )}
                    {cb?.loading && <div className="md-cob sm">Gerando mensagem…</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <style jsx global>{`
.md-wrap{max-width:960px;margin:0 auto;padding:24px 22px 90px;color:var(--tx);font-size:14px}
@keyframes mdup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes mdgrow{from{width:0 !important}}
.md-head{animation:mdup .5s ease}
.md-head h1{font-size:23px;font-weight:750;color:var(--tx-strong);letter-spacing:-.02em}
.md-head p{color:var(--muted);margin-top:6px;max-width:680px;line-height:1.5}
.md-load{display:flex;align-items:center;justify-content:center;gap:10px;padding:56px;color:var(--faint)}
.md-spin{width:15px;height:15px;border:2px solid var(--surface2);border-top-color:var(--acao);border-radius:50%;animation:mdspin .7s linear infinite}
@keyframes mdspin{to{transform:rotate(360deg)}}

.md-top{display:grid;grid-template-columns:1.7fr 1fr 1fr 1fr;gap:13px;margin:20px 0 16px;animation:mdup .5s ease .05s both}
.md-perf{display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;box-shadow:var(--shadow-card)}
.md-gauge{flex-shrink:0}
.md-gauge-n{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.md-perf-txt{display:flex;flex-direction:column;gap:3px;min-width:0}
.md-perf-lbl{font-size:12.5px;color:var(--muted);font-weight:600}
.md-perf-sub{font-size:15px;color:var(--tx-strong);font-weight:700}
.md-meta{font-size:11.5px;color:var(--atencao);font-weight:600}
.md-meta.ok{color:var(--ok)}
.md-mini{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;justify-content:center;box-shadow:var(--shadow-card)}
.md-mini b{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.md-mini span{font-size:12px;color:var(--muted);margin-top:4px}
.md-mini-r b{color:var(--erro)} .md-mini-a b{color:var(--atencao)} .md-mini-c b{color:var(--acao)}

.md-prox{margin-bottom:18px;animation:mdup .5s ease .1s both}
.md-prox h2,.md-fila h2{font-size:14px;font-weight:700;color:var(--tx-strong);margin-bottom:11px;display:flex;align-items:center;gap:9px}
.md-cnt{font-size:11.5px;font-weight:600;color:var(--faint);background:var(--surface2);padding:3px 10px;border-radius:20px}
.md-prox-list{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}
.md-prox-item{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 14px}
.md-prox-dia{display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--surface2);border-radius:10px;padding:6px 10px;min-width:46px}
.md-prox-dia b{font-size:19px;font-weight:800;color:var(--tx-strong);line-height:1}
.md-prox-dia span{font-size:10.5px;color:var(--muted);text-transform:uppercase}
.md-prox-info{min-width:0}
.md-prox-info b{display:block;font-size:13.5px;color:var(--tx-strong)}
.md-prox-info small{font-size:11px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}

.md-fila{animation:mdup .5s ease .15s both}
.md-zero{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px;text-align:center;font-weight:500;color:var(--ok)}
.md-list{list-style:none;display:flex;flex-direction:column;gap:9px}
.md-item{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;transition:.15s}
.md-item:hover{border-color:var(--acao)}
.md-row{display:flex;align-items:center;gap:14px;padding:13px 16px}
.md-cli{flex:1;min-width:0}
.md-cli b{display:block;font-weight:650;color:var(--tx-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-cli small{color:var(--faint);font-size:12px}
.md-meses{display:flex;flex-wrap:wrap;gap:5px;max-width:44%;justify-content:flex-end}
.md-tag{background:color-mix(in srgb, var(--erro) 14%, transparent);color:var(--erro);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;text-transform:capitalize}
.md-cobrar{border:none;background:var(--acao);color:#fff;border-radius:9px;padding:8px 15px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:.15s}
.md-cobrar:hover{background:var(--acao-hover)}
.md-cob{border-top:1px solid var(--border-soft);padding:12px 16px;background:var(--surface2)}
.md-cob.sm{color:var(--faint);font-size:13px}
.md-ja{color:var(--atencao);font-weight:600;font-size:12px;margin-bottom:6px}
.md-envio{font-size:12px;font-weight:600;color:var(--ok)}
.md-cob textarea{width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;font-family:inherit;line-height:1.45;resize:vertical;background:var(--surface);color:var(--tx)}
.md-acts{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.md-wa{background:#25D366;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;text-decoration:none;border:none;cursor:pointer}
.md-wa:disabled{opacity:.6;cursor:default}
.md-wa.off{background:var(--surface2);color:var(--faint)}
.md-copy{border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;color:var(--muted);text-decoration:none}
@media(max-width:760px){.md-top{grid-template-columns:1fr 1fr}.md-perf{grid-column:1 / -1}.md-prox-list{grid-template-columns:1fr 1fr}}
@media(max-width:640px){.md-row{flex-wrap:wrap}.md-meses{max-width:100%;justify-content:flex-start;order:3;width:100%}}
      `}</style>
    </div>
  );
}
