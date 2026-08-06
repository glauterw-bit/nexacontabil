'use client';
import { useEffect, useState, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MESC = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type Panorama = {
  competencia: string;
  ehMesCorrente: boolean;
  pulso: { docsHoje: number; docs2026: number; driveLidoHaMin: number; totalClientes: number };
  kpis: { obrigVencidas: number; obrigVencem7: number; obrigAVencer: number; obrigEntregues: number; obrigNoPrazo: number; obrigTotal: number; pctEntrega: number; pctNoPrazo: number; semDocMes: number; semResponsavel: number; cnpjProvisorio: number };
  insights: { nivel: string; titulo: string; texto: string; rota?: string }[];
};
type Desemp = { ano: number; analistas: { responsavel: string; clientes: number; entregues: number; devidas: number; taxa: number; atrasados: number }[] };
type Prazos = { total: number; atrasadas: number; proximas7dias: number; entregues: number; porTipo: { type: string; total: number; atrasadas: number }[] };
type Tend = { linha: { mes: string; documentos: number; pctEntrega: number }[] };

/* animação de contagem */
function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setV(target * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, dur]);
  return v;
}
function Num({ value, dec = 0, suf = '' }: { value: number; dec?: number; suf?: string }) {
  const v = useCountUp(value);
  return <>{v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suf}</>;
}

/* anel de progresso animado */
function Ring({ pct, size = 120, tone = 'var(--acao)' }: { pct: number; size?: number; tone?: string }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  const [dash, setDash] = useState(c);
  useEffect(() => { const id = setTimeout(() => setDash(c * (1 - Math.min(1, pct / 100))), 120); return () => clearTimeout(id); }, [pct, c]);
  return (
    <svg width={size} height={size} className="tc-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={9} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={9} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={dash} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }} />
      <text x="50%" y="49%" textAnchor="middle" className="tc-ring-n">{Math.round(pct)}</text>
      <text x="50%" y="65%" textAnchor="middle" className="tc-ring-s">%</text>
    </svg>
  );
}

/* gráfico de área 12 meses */
function AreaChart({ data }: { data: { mes: string; documentos: number; pctEntrega: number }[] }) {
  const w = 680, h = 150, pad = 6;
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.documentos), 1);
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const pt = (i: number, v: number) => [pad + i * step, h - pad - (v / max) * (h - pad * 2 - 14)];
  const pts = data.map((d, i) => pt(i, d.documentos));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const id = setTimeout(() => setDrawn(true), 100); return () => clearTimeout(id); }, []);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tc-area" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tcgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--acao)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--acao)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#tcgrad)" style={{ opacity: drawn ? 1 : 0, transition: 'opacity 1s ease .3s' }} />
      <path d={line} fill="none" stroke="var(--acao)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round"
        pathLength={1} strokeDasharray={1} strokeDashoffset={drawn ? 0 : 1} style={{ transition: 'stroke-dashoffset 1.3s ease' }} />
      {pts.map((p, i) => (
        <g key={i} style={{ opacity: drawn ? 1 : 0, transition: `opacity .4s ease ${0.5 + i * 0.04}s` }}>
          <circle cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5} fill="var(--acao)" stroke="var(--surface)" strokeWidth={i === pts.length - 1 ? 2 : 0} />
          <text x={p[0]} y={h - 1} textAnchor="middle" className="tc-area-x">{MESC[(parseInt((data[i].mes || '').slice(5, 7), 10) || 1) - 1]}</text>
        </g>
      ))}
    </svg>
  );
}

const MESLONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Torre() {
  const [pan, setPan] = useState<Panorama | null>(null);
  const [des, setDes] = useState<Desemp | null>(null);
  const [pz, setPz] = useState<Prazos | null>(null);
  const [tend, setTend] = useState<Tend | null>(null);
  const [loading, setLoading] = useState(true);
  const hoje = new Date();
  const [comp, setComp] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);

  const carregar = useCallback((cp: string) => {
    setLoading(true);
    const g = (ep: string) => fetch(`${API}/api/v1/${ep}`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null);
    const ano = cp.slice(0, 4);
    Promise.all([g(`paineis/panorama?comp=${cp}`), g(`paineis/desempenho-analistas?ano=${ano}`), g(`paineis/prazos?comp=${cp}`), g('paineis/tendencias')])
      .then(([p, d, z, t]) => { setPan(p); setDes(d); setPz(z); setTend(t); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(comp); }, [carregar, comp]);

  const mudarMes = (delta: number) => {
    const [a, m] = comp.split('-').map(Number);
    const dt = new Date(a, m - 1 + delta, 1);
    const nc = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    if (nc <= atual) setComp(nc); // não navega para o futuro
  };
  const [ca, cm] = comp.split('-').map(Number);
  const rotuloMes = `${MESLONG[cm - 1]} ${ca}`;
  const ehAtual = pan?.ehMesCorrente ?? true;

  if (loading) return <div className="tc-wrap"><div className="tc-load"><span className="tc-spin" />montando a torre…</div><Estilo /></div>;

  const k = pan?.kpis; const pu = pan?.pulso;
  const analistas = (des?.analistas ?? []).filter((a) => a.devidas > 0).sort((a, b) => b.taxa - a.taxa);
  const maxTipo = Math.max(1, ...(pz?.porTipo ?? []).map((t) => t.total));
  const toneTaxa = (t: number) => (t >= 90 ? 'var(--ok)' : t >= 70 ? 'var(--atencao)' : 'var(--erro)');

  return (
    <div className="tc-wrap">
      <header className="tc-head">
        <div>
          <span className="tc-eyebrow">Torre de Controle</span>
          <h1>{ehAtual ? 'Aqui está o escritório agora.' : `Como foi ${rotuloMes}.`}</h1>
        </div>
        <div className="tc-head-r">
          <div className="tc-mes">
            <button onClick={() => mudarMes(-1)} title="Mês anterior">‹</button>
            <b>{rotuloMes}</b>
            <button onClick={() => mudarMes(1)} disabled={ehAtual} title="Próximo mês">›</button>
          </div>
          {ehAtual && <span className="tc-live"><span className="tc-live-dot" />Drive lido há {pu?.driveLidoHaMin ?? '—'} min</span>}
          <button className="tc-refresh" onClick={() => carregar(comp)} title="Atualizar">↻</button>
        </div>
      </header>

      {/* PULSO — bloco herói */}
      <section className="tc-hero">
        <div className="tc-hero-ring">
          <Ring pct={k?.pctNoPrazo ?? 0} tone={toneTaxa(k?.pctNoPrazo ?? 0)} />
          <div className="tc-hero-ring-txt">
            <b>{ehAtual ? 'Sob controle no mês' : 'Entregue no mês'}</b>
            <small><Num value={k?.obrigEntregues ?? 0} /> entregues de {k?.obrigTotal ?? 0}</small>
            <div className="tc-breakdown">
              <span className="b-ok">● {k?.obrigEntregues ?? 0} entregue</span>
              {ehAtual && <span className="b-av">● {k?.obrigAVencer ?? 0} a vencer</span>}
              <span className="b-late">● {k?.obrigVencidas ?? 0} vencida</span>
            </div>
          </div>
        </div>
        <div className="tc-hero-kpis">
          <Kpi tone="erro" n={k?.obrigVencidas ?? 0} label="vencidas (atrasadas)" sub={ehAtual ? `${k?.obrigAVencer ?? 0} ainda no prazo` : 'passaram do prazo'} rota={`/prazos`} />
          <Kpi tone="info" n={pu?.docs2026 ?? 0} label="documentos em 2026" sub={`+${pu?.docsHoje ?? 0} capturados hoje`} />
          <Kpi tone="atencao" n={k?.semDocMes ?? 0} label="clientes sem doc no mês" sub={ehAtual ? 'muitos ainda vão enviar' : 'não enviaram no mês'} rota="/solicitacoes" />
          <Kpi tone="acao" n={pu?.totalClientes ?? 0} label="clientes na carteira" sub={`${k?.cnpjProvisorio ?? 0} com CNPJ provisório`} />
        </div>
      </section>
      {ehAtual && (
        <p className="tc-ctx">Estamos no dia {hoje.getDate()} de {rotuloMes}: a maior parte das obrigações do mês <b>ainda não venceu</b> — por isso o número alto de "a vencer" é normal. O anel mede o que está <b>no prazo</b> (entregue + ainda dentro do prazo); só as <b>vencidas</b> exigem ação hoje.</p>
      )}

      <div className="tc-grid">
        {/* TENDÊNCIA */}
        <section className="tc-card tc-span2">
          <div className="tc-card-h"><h2>Volume de documentos · 12 meses</h2><span className="tc-tag">captura</span></div>
          <AreaChart data={tend?.linha ?? []} />
        </section>

        {/* RADAR DE PRAZOS */}
        <section className="tc-card">
          <div className="tc-card-h"><h2>Radar de prazos</h2><a href="/prazos" className="tc-link">abrir →</a></div>
          <div className="tc-pz-top">
            <div><b className="tc-pz-big" style={{ color: 'var(--erro)' }}><Num value={pz?.atrasadas ?? 0} /></b><span>atrasadas</span></div>
            <div><b className="tc-pz-big" style={{ color: 'var(--ok)' }}><Num value={pz?.entregues ?? 0} /></b><span>entregues</span></div>
            <div><b className="tc-pz-big"><Num value={pz?.total ?? 0} /></b><span>no total</span></div>
          </div>
          <div className="tc-bars">
            {(pz?.porTipo ?? []).slice(0, 8).map((t) => (
              <div key={t.type} className="tc-bar-row">
                <span className="tc-bar-lbl">{t.type}</span>
                <div className="tc-bar-track">
                  <div className="tc-bar-fill" style={{ width: `${(t.total / maxTipo) * 100}%` }} />
                  <div className="tc-bar-late" style={{ width: `${(t.atrasadas / maxTipo) * 100}%` }} />
                </div>
                <span className="tc-bar-val">{t.total}{t.atrasadas ? <em> · {t.atrasadas} atr.</em> : null}</span>
              </div>
            ))}
          </div>
        </section>

        {/* RANKING ANALISTAS */}
        <section className="tc-card tc-span2">
          <div className="tc-card-h"><h2>Desempenho por analista</h2><a href="/gerencial" className="tc-link">ver painel →</a></div>
          <div className="tc-rank">
            {analistas.map((a, i) => (
              <a key={a.responsavel} className="tc-rank-row" href={`/central-entregas?responsavel=${encodeURIComponent(a.responsavel)}`}>
                <span className="tc-rank-pos">{i + 1}</span>
                <div className="tc-rank-cli">
                  <b>{a.responsavel}</b>
                  <small>{a.clientes} clientes · {a.entregues}/{a.devidas} entregues{a.atrasados ? ` · ${a.atrasados} atrasados` : ''}</small>
                </div>
                <div className="tc-rank-bar"><div className="tc-rank-fill" style={{ width: `${a.taxa}%`, background: toneTaxa(a.taxa) }} /></div>
                <span className="tc-rank-pct" style={{ color: toneTaxa(a.taxa) }}>{a.taxa}%</span>
              </a>
            ))}
            {analistas.length === 0 && <p className="tc-empty">Sem obrigações devidas no período.</p>}
          </div>
        </section>

        {/* INSIGHTS ACIONÁVEIS */}
        <section className="tc-card">
          <div className="tc-card-h"><h2>O que precisa de você</h2></div>
          <div className="tc-insights">
            {(pan?.insights ?? []).map((ins, i) => (
              <a key={i} className={`tc-ins n-${ins.nivel}`} href={ins.rota || '#'}>
                <span className="tc-ins-dot" />
                <div><b>{ins.titulo}</b><small>{ins.texto}</small></div>
                {ins.rota ? <span className="tc-ins-go">→</span> : null}
              </a>
            ))}
            {(pan?.insights ?? []).length === 0 && <p className="tc-empty">Tudo tranquilo por aqui. 🎉</p>}
          </div>
        </section>
      </div>
      <Estilo />
    </div>
  );
}

function Kpi({ tone, n, label, sub, rota }: { tone: string; n: number; label: string; sub?: string; rota?: string }) {
  const inner = (
    <>
      <b className={`tc-kpi-n t-${tone}`}><Num value={n} /></b>
      <span className="tc-kpi-l">{label}</span>
      {sub ? <small className="tc-kpi-s">{sub}</small> : null}
    </>
  );
  return rota ? <a className="tc-kpi link" href={rota}>{inner}</a> : <div className="tc-kpi">{inner}</div>;
}

function Estilo() {
  return (
    <style jsx global>{`
.tc-wrap{max-width:1160px;margin:0 auto;padding:26px 24px 90px;color:var(--tx);font-size:14px}
.tc-load{display:flex;align-items:center;justify-content:center;gap:10px;padding:120px;color:var(--faint)}
.tc-spin{width:16px;height:16px;border:2px solid var(--surface2);border-top-color:var(--acao);border-radius:50%;animation:tcspin .7s linear infinite}
@keyframes tcspin{to{transform:rotate(360deg)}}
@keyframes tcup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

.tc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:22px;animation:tcup .5s ease}
.tc-eyebrow{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--acao)}
.tc-head h1{font-size:26px;font-weight:750;letter-spacing:-.02em;margin-top:5px;color:var(--tx-strong)}
.tc-head-r{display:flex;align-items:center;gap:12px;flex-shrink:0}
.tc-mes{display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:3px 4px}
.tc-mes b{font-size:13px;font-weight:700;color:var(--tx-strong);min-width:112px;text-align:center}
.tc-mes button{width:30px;height:30px;border:none;background:transparent;border-radius:8px;font-size:18px;cursor:pointer;color:var(--muted);transition:.13s}
.tc-mes button:hover:not(:disabled){background:var(--surface2);color:var(--acao)}
.tc-mes button:disabled{opacity:.3;cursor:default}
.tc-ctx{background:color-mix(in srgb, var(--info) 8%, transparent);border:1px solid color-mix(in srgb, var(--info) 22%, transparent);color:var(--muted);border-radius:12px;padding:11px 15px;margin-bottom:18px;font-size:12.5px;line-height:1.5;animation:tcup .5s ease .08s both}
.tc-ctx b{color:var(--tx-strong)}
.tc-breakdown{display:flex;flex-wrap:wrap;gap:10px;margin-top:7px;font-size:11.5px;font-weight:600}
.tc-breakdown .b-ok{color:var(--ok)} .tc-breakdown .b-av{color:var(--info)} .tc-breakdown .b-late{color:var(--erro)}
.tc-live{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 13px}
.tc-live-dot{width:8px;height:8px;border-radius:50%;background:var(--dot-ok);box-shadow:0 0 0 0 var(--dot-ok);animation:tcpulse 2s infinite}
@keyframes tcpulse{0%{box-shadow:0 0 0 0 rgba(18,183,106,.5)}70%{box-shadow:0 0 0 7px rgba(18,183,106,0)}100%{box-shadow:0 0 0 0 rgba(18,183,106,0)}}
.tc-refresh{width:38px;height:38px;border:1px solid var(--border);background:var(--surface);border-radius:11px;font-size:17px;cursor:pointer;color:var(--muted);transition:.15s}
.tc-refresh:hover{color:var(--acao);border-color:var(--acao);transform:rotate(90deg)}

.tc-hero{display:flex;align-items:center;gap:30px;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px 28px;margin-bottom:18px;box-shadow:var(--shadow-card);animation:tcup .5s ease .05s both}
.tc-hero-ring{display:flex;align-items:center;gap:16px;flex-shrink:0;padding-right:28px;border-right:1px solid var(--border-soft)}
.tc-ring-n{font-size:30px;font-weight:800;fill:var(--tx-strong);font-variant-numeric:tabular-nums}
.tc-ring-s{font-size:12px;fill:var(--faint);font-weight:600}
.tc-hero-ring-txt b{display:block;font-size:15px;color:var(--tx-strong);font-weight:700}
.tc-hero-ring-txt small{color:var(--muted);font-size:12.5px}
.tc-hero-kpis{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.tc-kpi{display:flex;flex-direction:column;gap:2px;padding:6px 4px;border-radius:12px;text-decoration:none;transition:.15s}
.tc-kpi.link{cursor:pointer}
.tc-kpi.link:hover{background:var(--surface2);transform:translateY(-2px)}
.tc-kpi-n{font-size:27px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.tc-kpi-l{font-size:12.5px;color:var(--tx);font-weight:600;margin-top:2px}
.tc-kpi-s{font-size:11.5px;color:var(--faint)}
.t-erro{color:var(--erro)} .t-atencao{color:var(--atencao)} .t-info{color:var(--info)} .t-acao{color:var(--acao)} .t-ok{color:var(--ok)}

.tc-grid{display:grid;grid-template-columns:2fr 1fr;gap:16px}
.tc-card{background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow-card);animation:tcup .5s ease .1s both}
.tc-span2{grid-column:1 / -1}
.tc-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.tc-card-h h2{font-size:15px;font-weight:700;color:var(--tx-strong)}
.tc-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--acao);background:var(--surface2);padding:3px 9px;border-radius:20px}
.tc-link{font-size:12.5px;color:var(--acao);text-decoration:none;font-weight:600}
.tc-link:hover{text-decoration:underline}

.tc-area{width:100%;height:150px;display:block}
.tc-area-x{font-size:9.5px;fill:var(--faint)}

.tc-pz-top{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;text-align:center}
.tc-pz-top>div{background:var(--surface2);border-radius:12px;padding:11px 6px}
.tc-pz-big{display:block;font-size:24px;font-weight:800;font-variant-numeric:tabular-nums}
.tc-pz-top span{font-size:11px;color:var(--muted)}
.tc-bars{display:flex;flex-direction:column;gap:9px}
.tc-bar-row{display:grid;grid-template-columns:64px 1fr auto;align-items:center;gap:10px}
.tc-bar-lbl{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-bar-track{position:relative;height:9px;background:var(--surface2);border-radius:6px;overflow:hidden}
.tc-bar-fill{position:absolute;left:0;top:0;bottom:0;background:var(--acao);border-radius:6px;opacity:.35;animation:tcgrow 1s cubic-bezier(.22,1,.36,1)}
.tc-bar-late{position:absolute;left:0;top:0;bottom:0;background:var(--erro);border-radius:6px;animation:tcgrow 1.1s cubic-bezier(.22,1,.36,1)}
@keyframes tcgrow{from{width:0 !important}}
.tc-bar-val{font-size:11.5px;color:var(--tx);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-bar-val em{color:var(--erro);font-style:normal}

.tc-rank{display:flex;flex-direction:column;gap:4px}
.tc-rank-row{display:grid;grid-template-columns:26px 1fr 160px 42px;align-items:center;gap:14px;padding:9px 8px;border-radius:11px;text-decoration:none;color:inherit;transition:.13s}
.tc-rank-row:hover{background:var(--surface2)}
.tc-rank-pos{font-size:13px;font-weight:700;color:var(--faint);text-align:center}
.tc-rank-cli b{display:block;font-size:13.5px;color:var(--tx-strong);font-weight:650}
.tc-rank-cli small{font-size:11.5px;color:var(--faint)}
.tc-rank-bar{height:8px;background:var(--surface2);border-radius:5px;overflow:hidden}
.tc-rank-fill{height:100%;border-radius:5px;animation:tcgrow 1.1s cubic-bezier(.22,1,.36,1)}
.tc-rank-pct{font-size:14px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}

.tc-insights{display:flex;flex-direction:column;gap:9px}
.tc-ins{display:flex;align-items:flex-start;gap:11px;padding:12px 13px;border-radius:13px;background:var(--surface2);text-decoration:none;color:inherit;transition:.14s;border:1px solid transparent}
.tc-ins:hover{transform:translateX(3px);border-color:var(--border)}
.tc-ins-dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0;background:var(--info)}
.tc-ins.n-alerta .tc-ins-dot{background:var(--erro)} .tc-ins.n-atencao .tc-ins-dot{background:var(--atencao)} .tc-ins.n-ok .tc-ins-dot{background:var(--ok)}
.tc-ins b{display:block;font-size:13px;color:var(--tx-strong);font-weight:650;line-height:1.3}
.tc-ins small{font-size:11.5px;color:var(--muted);line-height:1.4}
.tc-ins-go{margin-left:auto;color:var(--faint);font-size:16px;align-self:center}
.tc-empty{color:var(--faint);font-size:13px;padding:14px 4px}

@media(max-width:900px){.tc-grid{grid-template-columns:1fr}.tc-hero{flex-direction:column;align-items:stretch}.tc-hero-ring{border-right:none;border-bottom:1px solid var(--border-soft);padding:0 0 18px;justify-content:center}.tc-hero-kpis{grid-template-columns:repeat(2,1fr)}.tc-rank-row{grid-template-columns:22px 1fr 90px 40px;gap:8px}}
    `}</style>
  );
}
