'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ICON: Record<string, string> = { ok: '✓', warn: '◐', late: '!', na: '' };

type Mes = { mes: number; status: 'ok' | 'warn' | 'late' | 'na'; ent: number; tot: number };
type Cli = { companyId: string; nome: string; codigo?: string; regime?: string; responsavel?: string; meses: Mes[]; pendencia: number };
type Dados = { ano: number; mesAtual: number; resumo: { totalClientes: number; emDia: number; parciais: number; atrasados: number; pct: number; proximoPrazoDias: number | null }; responsaveis: string[]; clientes: Cli[] };

function Spark({ meses }: { meses: Mes[] }) {
  const pts = meses.filter((x) => x.status !== 'na').map((x) => (x.status === 'ok' ? 1 : x.status === 'warn' ? 0.5 : 0));
  const w = 56, h = 18, step = w / Math.max(1, pts.length - 1);
  const d = pts.map((v, i) => `${i * step},${h - 2 - v * (h - 4)}`).join(' ');
  return <svg width={w} height={h}><polyline points={d} fill="none" stroke="#B7B2AB" strokeWidth={1.5} /></svg>;
}

export default function CentralEntregas() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState('');
  const [resp, setResp] = useState('');
  const [regime, setRegime] = useState('');
  const [sel, setSel] = useState<Cli | null>(null);
  const [det, setDet] = useState<any>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/paineis/calendario-entregas?ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!sel) { setDet(null); return; }
    setDet(null);
    fetch(`${API}/api/v1/paineis/calendario-cliente?companyId=${sel.companyId}&ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setDet).catch(() => setDet(null));
  }, [sel, ano]);

  const clientes = useMemo(() => {
    let l = d?.clientes ?? [];
    if (busca.trim()) { const q = busca.toLowerCase(); l = l.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)); }
    if (resp) l = l.filter((c) => c.responsavel === resp);
    if (regime) l = l.filter((c) => (c.regime ?? '').toUpperCase().includes(regime));
    return l;
  }, [d, busca, resp, regime]);

  const r = d?.resumo;
  const mAtual = d?.mesAtual ?? new Date().getMonth() + 1;

  return (
    <div className="ce-wrap">
      <style>{CSS}</style>
      <header className="ce-top">
        <div className="ce-brand">
          <div className="ce-logo">D</div>
          <div><h1>Central de Entregas</h1><p>Obrigações fiscais · situação por cliente e mês</p></div>
        </div>
        <div className="ce-monav">
          <button onClick={() => setAno((a) => a - 1)} aria-label="ano anterior">‹</button>
          <span className="cur tnum">{ano}</span>
          <button onClick={() => setAno((a) => a + 1)} aria-label="próximo ano" disabled={ano >= new Date().getFullYear()}>›</button>
        </div>
      </header>

      {loading ? <div className="ce-load">Carregando…</div> : !d ? <div className="ce-load">Não foi possível carregar.</div> : (<>
        <section className="ce-summary">
          <div className="ce-ringwrap">
            <div className="ce-ring" style={{ ['--p' as any]: r?.pct ?? 0 }}><b className="tnum">{r?.pct ?? 0}%</b></div>
            <div className="ce-ringlbl">
              <h2>{MESL[mAtual - 1]} de {ano}</h2>
              <p><b className="tnum">{r?.emDia ?? 0}</b> de <b className="tnum">{r?.totalClientes ?? 0}</b> clientes 100% em dia</p>
              {r && r.emDia === r.totalClientes && r.totalClientes > 0
                ? <span className="ce-chip ok">✓ Mês fechado — todos entregaram</span>
                : <span className="ce-chip">acompanhe as pendências ao lado →</span>}
            </div>
          </div>
          <div className="ce-stats">
            <div className="ce-stat ok"><div className="n tnum">{r?.emDia ?? 0}</div><div className="l">Tudo entregue</div></div>
            <div className="ce-stat warn"><div className="n tnum">{r?.parciais ?? 0}</div><div className="l">Falta algo</div></div>
            <div className="ce-stat late"><div className="n tnum">{r?.atrasados ?? 0}</div><div className="l">Atrasados</div></div>
            <div className="ce-stat due"><div className="n tnum">{r?.proximoPrazoDias != null ? `${r.proximoPrazoDias}d` : '—'}</div><div className="l">Próximo prazo</div></div>
          </div>
        </section>

        <div className="ce-toolbar">
          <div className="ce-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou código…" />
          </div>
          <select className="ce-flt" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {(d.responsaveis ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select className="ce-flt" value={regime} onChange={(e) => setRegime(e.target.value)}>
            <option value="">Todos os regimes</option><option value="SIMPLES">Simples</option><option value="MEI">MEI</option><option value="PRESUMIDO">Presumido</option><option value="REAL">Real</option>
          </select>
          <div className="ce-legend">
            <span><i className="sw" style={{ background: 'var(--ce-ok-cell)' }} />entregue</span>
            <span><i className="sw" style={{ background: 'var(--ce-warn-cell)' }} />parcial</span>
            <span><i className="sw" style={{ background: 'var(--ce-late-cell)' }} />atrasado</span>
            <span><i className="sw" style={{ background: 'var(--ce-na)' }} />a vencer</span>
          </div>
        </div>

        <div className="ce-board">
          <div className="ce-gridscroll">
            <div className="ce-grid">
              <div className="ce-ghead">
                <div className="cli">Cliente ({clientes.length})</div>
                {MES.map((m, i) => <div key={i}>{m}</div>)}
                <div className="spark">tendência</div>
              </div>
              {clientes.map((c) => {
                const dotc = c.pendencia === 0 ? 'var(--ce-ok)' : (c.meses.some((m) => m.status === 'late') ? 'var(--ce-late)' : 'var(--ce-warn)');
                return (
                  <div className="ce-grow" key={c.companyId} onClick={() => setSel(c)}>
                    <div className="cli"><span className="cdot" style={{ background: dotc }} /><span className="cinfo"><b>{c.nome}</b><small>{c.codigo ? `#${c.codigo} · ` : ''}{c.regime} · {c.responsavel || '—'}</small></span></div>
                    {c.meses.map((m) => <div key={m.mes}><div className={`ce-cell ${m.status}`} title={m.status === 'na' ? 'a vencer' : `${m.ent}/${m.tot} entregue`}>{ICON[m.status]}</div></div>)}
                    <div className="spark"><Spark meses={c.meses} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="ce-note">FGTS, eSocial e DARF são controlados no portal/banco (sem PDF) — não entram como pendência. Meses a vencer aparecem em cinza. Baseado nos comprovantes reais das pastas do Drive.</p>
      </>)}

      <div className={`ce-scrim ${sel ? 'open' : ''}`} onClick={() => setSel(null)} />
      <aside className={`ce-drawer ${sel ? 'open' : ''}`} aria-hidden={!sel}>
        {sel && (
          <>
            <div className="ce-dhead">
              <div className="row">
                <div>
                  <h3>{sel.nome}</h3>
                  <div className="meta"><span className="tag">{sel.regime}</span><span className="tag">Resp: {sel.responsavel || '—'}</span>{sel.codigo ? <span className="tag">#{sel.codigo}</span> : null}</div>
                </div>
                <button className="xbtn" onClick={() => setSel(null)}>✕</button>
              </div>
              <div className="ce-mini">{sel.meses.map((m) => <i key={m.mes} className={`ce-cell ${m.status}`}>{ICON[m.status]}</i>)}</div>
            </div>
            <div className="ce-dbody">
              {!det ? <div className="ce-load sm">Carregando…</div> : (
                Array.from({ length: 12 }, (_, k) => 12 - k).map((mm) => {
                  const obrs = (det.meses?.[mm] ?? []) as any[];
                  if (!obrs.length) return null;
                  const naoPortal = obrs.filter((o) => o.status !== 'portal');
                  const ent = naoPortal.filter((o) => o.status === 'ok').length;
                  const tot = naoPortal.length;
                  const bcls = tot && ent === tot ? 'ok' : obrs.some((o) => o.status === 'late') ? 'late' : 'warn';
                  const open = mm === mAtual;
                  return (
                    <details key={mm} open={open} className="ce-mo">
                      <summary className="ce-moh"><span className="t">{MESL[mm - 1]} {ano}</span><span className={`b ${bcls}`}>{ent}/{tot} {tot && ent === tot ? '✓' : ''}</span></summary>
                      <ul className="ce-ob">
                        {obrs.map((o, idx) => (
                          <li key={idx}>
                            <span className={`oi ${o.status === 'ok' ? 'ok' : o.status === 'portal' ? 'portal' : 'late'}`}>{o.status === 'ok' ? '✓' : o.status === 'portal' ? '•' : '!'}</span>
                            <span className="on">{o.tipo}{o.status === 'portal' ? <span className="od"> · controle no portal/banco</span> : null}</span>
                            {o.status === 'ok' ? <span className="od">entregue</span> : o.status === 'portal' ? null : <span className="od" style={{ color: 'var(--ce-late)' }}>{new Date(o.vencimento) < new Date() ? 'vencida' : 'a vencer'}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

const CSS = `
.ce-wrap{--ce-surface:#fff;--ce-surface2:#F5F5F4;--ce-border:#E7E5E4;--ce-border-soft:#EFEEEC;--ce-tx:#1C1917;--ce-tx2:#57534E;--ce-tx3:#8A857E;--ce-accent:#0F766E;--ce-accent-soft:#E6F1EF;--ce-ok:#2E7D5B;--ce-ok-bg:#E4F3EC;--ce-ok-cell:#8FD0B0;--ce-warn:#B7791F;--ce-warn-bg:#FBF0DA;--ce-warn-cell:#F0C270;--ce-late:#C0362C;--ce-late-bg:#FBE5E2;--ce-late-cell:#E88A82;--ce-na:#F1F1F0;max-width:1180px;margin:0 auto;padding:22px 22px 80px;color:var(--ce-tx);font-size:14px}
.ce-wrap .tnum{font-variant-numeric:tabular-nums}
.ce-load{padding:60px;text-align:center;color:var(--ce-tx3)}.ce-load.sm{padding:30px}
.ce-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.ce-brand{display:flex;align-items:center;gap:12px}
.ce-logo{width:38px;height:38px;border-radius:10px;background:var(--ce-accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:16px}
.ce-brand h1{font-size:18px;font-weight:650;letter-spacing:-.01em}.ce-brand p{font-size:12.5px;color:var(--ce-tx3)}
.ce-monav{display:flex;align-items:center;gap:6px;background:var(--ce-surface);border:1px solid var(--ce-border);border-radius:10px;padding:4px}
.ce-monav button{border:none;background:none;color:var(--ce-tx2);width:30px;height:30px;border-radius:7px;cursor:pointer;font-size:16px}
.ce-monav button:hover:not(:disabled){background:var(--ce-surface2)}.ce-monav button:disabled{opacity:.3;cursor:default}
.ce-monav .cur{font-weight:600;padding:0 12px;font-size:14px}
.ce-summary{background:var(--ce-surface);border:1px solid var(--ce-border);border-radius:16px;padding:20px 22px;margin-bottom:20px;display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:center;box-shadow:0 1px 2px rgba(28,25,23,.05)}
.ce-ringwrap{display:flex;align-items:center;gap:16px}
.ce-ring{width:92px;height:92px;border-radius:50%;background:conic-gradient(var(--ce-ok) calc(var(--p,0)*1%),var(--ce-surface2) 0);display:grid;place-items:center;position:relative}
.ce-ring::after{content:'';position:absolute;inset:9px;background:var(--ce-surface);border-radius:50%}
.ce-ring b{position:relative;z-index:1;font-size:21px;font-weight:700}
.ce-ringlbl h2{font-size:15px;font-weight:600}.ce-ringlbl p{font-size:13px;color:var(--ce-tx2);margin-top:2px}
.ce-chip{display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:var(--ce-surface2);color:var(--ce-tx2);padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600}
.ce-chip.ok{background:var(--ce-ok-bg);color:var(--ce-ok)}
.ce-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.ce-stat{border-left:3px solid var(--ce-border);padding:2px 0 2px 14px}
.ce-stat .n{font-size:22px;font-weight:700;letter-spacing:-.02em}.ce-stat .l{font-size:12.5px;color:var(--ce-tx2);margin-top:1px}
.ce-stat.ok{border-color:var(--ce-ok)}.ce-stat.ok .n{color:var(--ce-ok)}
.ce-stat.warn{border-color:var(--ce-warn)}.ce-stat.warn .n{color:var(--ce-warn)}
.ce-stat.late{border-color:var(--ce-late)}.ce-stat.late .n{color:var(--ce-late)}
.ce-stat.due{border-color:var(--ce-accent)}.ce-stat.due .n{color:var(--ce-accent)}
.ce-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.ce-search{position:relative;flex:1 1 240px;min-width:190px}
.ce-search input{width:100%;border:1px solid var(--ce-border);background:var(--ce-surface);border-radius:10px;padding:9px 12px 9px 34px;font-size:13.5px;font-family:inherit;color:var(--ce-tx)}
.ce-search input:focus{outline:2px solid var(--ce-accent-soft);border-color:var(--ce-accent)}
.ce-search svg{position:absolute;left:11px;top:9.5px;color:var(--ce-tx3)}
.ce-flt{border:1px solid var(--ce-border);background:var(--ce-surface);border-radius:10px;padding:9px 12px;font-size:13.5px;color:var(--ce-tx2);font-family:inherit;cursor:pointer}
.ce-legend{display:flex;gap:13px;margin-left:auto;font-size:12px;color:var(--ce-tx2);align-items:center;flex-wrap:wrap}
.ce-legend span{display:inline-flex;align-items:center;gap:6px}.ce-legend .sw{width:13px;height:13px;border-radius:4px}
.ce-board{background:var(--ce-surface);border:1px solid var(--ce-border);border-radius:16px;box-shadow:0 1px 2px rgba(28,25,23,.05);overflow:hidden}
.ce-gridscroll{overflow-x:auto}
.ce-grid{display:grid;grid-template-columns:230px repeat(12,30px) 72px;min-width:682px}
.ce-ghead{display:contents}
.ce-ghead>div{position:sticky;top:0;background:var(--ce-surface);z-index:3;border-bottom:1px solid var(--ce-border);padding:11px 0;font-size:11.5px;font-weight:600;color:var(--ce-tx3);text-align:center}
.ce-ghead .cli{left:0;z-index:4;text-align:left;padding-left:16px;text-transform:uppercase;letter-spacing:.04em}
.ce-grow{display:contents;cursor:pointer}
.ce-grow>div{border-bottom:1px solid var(--ce-border-soft);height:44px;display:flex;align-items:center;justify-content:center}
.ce-grow:hover>div{background:var(--ce-accent-soft)}
.ce-grow .cli{position:sticky;left:0;background:var(--ce-surface);z-index:2;justify-content:flex-start;padding-left:16px;gap:9px;overflow:hidden}
.ce-grow:hover .cli{background:var(--ce-accent-soft)}
.cdot{width:7px;height:7px;border-radius:50%;flex:none}.cinfo{overflow:hidden}
.cinfo b{font-size:13px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:160px}
.cinfo small{font-size:11px;color:var(--ce-tx3)}
.ce-cell{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:700}
.ce-cell.ok{background:var(--ce-ok-cell);color:#12503a}.ce-cell.warn{background:var(--ce-warn-cell);color:#6b470c}.ce-cell.late{background:var(--ce-late-cell);color:#6b1712}.ce-cell.na{background:var(--ce-na)}
.ce-grow .spark{justify-content:flex-end;padding-right:12px}
.ce-note{font-size:12px;color:var(--ce-tx3);margin-top:12px;text-align:center}
.ce-scrim{position:fixed;inset:0;background:rgba(28,25,23,.32);opacity:0;pointer-events:none;transition:opacity .18s;z-index:40}
.ce-scrim.open{opacity:1;pointer-events:auto}
.ce-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:92vw;background:var(--ce-surface);border-left:1px solid var(--ce-border);transform:translateX(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);z-index:41;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(28,25,23,.10)}
.ce-drawer.open{transform:none}
.ce-dhead{padding:20px 22px 16px;border-bottom:1px solid var(--ce-border)}
.ce-dhead .row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ce-dhead h3{font-size:16.5px;font-weight:650}
.ce-dhead .meta{font-size:12.5px;color:var(--ce-tx2);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap}
.tag{background:var(--ce-surface2);border:1px solid var(--ce-border);border-radius:999px;padding:2px 9px;font-size:11.5px;color:var(--ce-tx2)}
.xbtn{border:none;background:var(--ce-surface2);width:30px;height:30px;border-radius:8px;cursor:pointer;color:var(--ce-tx2);font-size:15px;flex:none}
.xbtn:hover{background:var(--ce-border)}
.ce-mini{display:flex;gap:3px;margin-top:14px;flex-wrap:wrap}.ce-mini i{width:20px;height:20px;border-radius:5px;font-style:normal;font-size:10px;font-weight:700;display:grid;place-items:center}
.ce-dbody{overflow-y:auto;padding:6px 0 30px}
.ce-mo{border-bottom:1px solid var(--ce-border-soft)}
.ce-moh{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;cursor:pointer;list-style:none}
.ce-moh::-webkit-details-marker{display:none}
.ce-moh:hover{background:var(--ce-surface2)}.ce-moh .t{font-size:13.5px;font-weight:600}
.ce-moh .b{font-size:12px;font-weight:600;padding:2px 9px;border-radius:999px}
.ce-moh .b.ok{background:var(--ce-ok-bg);color:var(--ce-ok)}.ce-moh .b.warn{background:var(--ce-warn-bg);color:var(--ce-warn)}.ce-moh .b.late{background:var(--ce-late-bg);color:var(--ce-late)}
.ce-ob{list-style:none;padding:0 22px 12px;margin:0}
.ce-ob li{display:flex;align-items:center;gap:11px;padding:8px 0;border-top:1px dashed var(--ce-border-soft)}.ce-ob li:first-child{border-top:none}
.oi{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none}
.oi.ok{background:var(--ce-ok-bg);color:var(--ce-ok)}.oi.late{background:var(--ce-late-bg);color:var(--ce-late)}.oi.portal{background:var(--ce-surface2);color:var(--ce-tx3)}
.ce-ob .on{flex:1;font-size:13px}.ce-ob .od{font-size:11.5px;color:var(--ce-tx3)}
@media(max-width:640px){.ce-summary{grid-template-columns:1fr;gap:16px}.ce-stats{grid-template-columns:repeat(2,1fr)}}
`;
