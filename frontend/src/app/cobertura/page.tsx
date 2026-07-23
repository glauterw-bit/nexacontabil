'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const ICON: Record<string, string> = { prova: '✓', ok: '✓', parcial: '◐', falta: '!', isenta: '–', na: '' };

type Mes = { mes: number; status: 'prova' | 'ok' | 'parcial' | 'falta' | 'isenta' | 'na'; ent: number; tot: number; comProva: number; criadas: number };
type Cli = { companyId: string; nome: string; codigo?: string; regime?: string; responsavel?: string; clienteDesde?: string | null; meses: Mes[]; prova: number; entregues: number; faltam: number; criadas: number };
type Dados = { ano: number; resumo: { totalClientes: number; obEntregues: number; comProva: number; obFaltam: number; criadasPeloCrawl: number; taxaEntrega: number; taxaProva: number }; clientes: Cli[] };

function Ring({ pct, label, sub, tone }: { pct: number; label: string; sub: string; tone: string }) {
  const r = 30, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  return (
    <div className="cb-ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--cb-track)" strokeWidth="7" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 38 38)" />
        <text x="38" y="42" textAnchor="middle" className="cb-ring-n">{pct}%</text>
      </svg>
      <div><div className="cb-ring-l">{label}</div><div className="cb-ring-s">{sub}</div></div>
    </div>
  );
}

export default function Cobertura() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState('');
  const [soFalta, setSoFalta] = useState(false);

  const [resp, setResp] = useState('');
  const [todosResp, setTodosResp] = useState<string[]>([]);
  const carregar = useCallback(() => {
    setLoading(true);
    const u = `${API}/api/v1/paineis/cobertura?ano=${ano}${resp ? `&responsavel=${encodeURIComponent(resp)}` : ''}`;
    fetch(u, { headers: authHeaders() })
      .then((r) => r.json()).then((j) => { setD(j); if (!resp && j?.clientes) setTodosResp([...new Set(j.clientes.map((c: any) => c.responsavel).filter(Boolean))] as string[]); }).catch(() => setD(null)).finally(() => setLoading(false));
  }, [ano, resp]);
  useEffect(() => { carregar(); }, [carregar]);

  const r = d?.resumo;
  const clientes = useMemo(() => {
    let l = d?.clientes ?? [];
    if (busca) { const q = busca.toLowerCase(); l = l.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)); }
    if (soFalta) l = l.filter((c) => c.faltam > 0);
    return l;
  }, [d, busca, soFalta]);

  return (
    <div className="cb-wrap">
      <header className="cb-head">
        <div>
          <h1>Cobertura <span className="cb-badge">prova por enumeração</span></h1>
          <p>Cada mês é comprovado pela leitura da árvore real do OneDrive. <b>✓ verde-forte</b> = recibo no drive com link. O crawl varre a carteira sozinho e fecha o que a busca perde.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={resp} onChange={(e) => setResp(e.target.value)} className="cb-year" title="Ver a carteira de um analista">
            <option value="">Escritório (todos)</option>
            {(todosResp.length ? todosResp : [...new Set((d?.clientes ?? []).map((c) => c.responsavel).filter(Boolean))]).map((x) => <option key={x} value={x as string}>👤 Ver como {x}</option>)}
          </select>
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="cb-year">
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      {loading ? <div className="cb-load">Carregando cobertura…</div> : !d ? <div className="cb-load">Sem dados.</div> : (
        <>
          {resp ? <div className="cb-vercomo">👤 Vendo como <b>{resp}</b> — cobertura da carteira deste analista <button onClick={() => setResp('')}>voltar ao escritório ✕</button></div> : null}
          <section className="cb-kpis">
            <Ring pct={r!.taxaEntrega} label="Taxa de entrega" sub={`${r!.obEntregues} de ${r!.obEntregues + r!.obFaltam} devidas`} tone="var(--cb-ok)" />
            <Ring pct={r!.taxaProva} label="Provados por recibo" sub={`${r!.comProva} entregas com link no drive`} tone="var(--cb-accent)" />
            <div className="cb-stat"><div className="n">{r!.criadasPeloCrawl}</div><div className="l">Obrigações criadas pelo crawl<small>a partir de recibos sem obrigação</small></div></div>
            <div className="cb-stat falta"><div className="n">{r!.obFaltam}</div><div className="l">Faltam (recibo não subido)<small>o que a equipe precisa cobrar</small></div></div>
          </section>

          <div className="cb-toolbar">
            <input placeholder="Buscar cliente ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} className="cb-search" />
            <label className="cb-check"><input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} /> só com pendência</label>
            <span className="cb-count">{clientes.length} clientes</span>
          </div>

          <div className="cb-legend">
            <span><i className="sw prova" />provado (recibo + link)</span>
            <span><i className="sw ok" />entregue</span>
            <span><i className="sw parcial" />parcial</span>
            <span><i className="sw falta" />falta</span>
            <span><i className="sw isenta" />isento (antes do início)</span>
            <span><i className="sw na" />a vencer</span>
          </div>

          <div className="cb-tablewrap">
            <table className="cb-table">
              <thead><tr><th className="cb-cli">Cliente</th>{MES.map((m, i) => <th key={i} className="cb-mh">{m}</th>)}<th className="cb-num">prova</th><th className="cb-num">falta</th></tr></thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.companyId}>
                    <td className="cb-cli"><b title={c.nome}>{c.nome}</b><small>{c.codigo ? `#${c.codigo} · ` : ''}{c.regime}{c.clienteDesde ? ` · desde ${c.clienteDesde.slice(5, 7)}/${c.clienteDesde.slice(0, 4)}` : ''}{c.criadas ? ` · ${c.criadas} recuperada(s)` : ''}</small></td>
                    {c.meses.map((m) => <td key={m.mes} className="cb-mc"><span className={`cb-cell ${m.status}`} title={m.tot ? `${m.comProva}/${m.tot} com recibo linkado · ${m.ent}/${m.tot} entregue` : (m.status === 'isenta' ? 'isento' : 'a vencer')}>{ICON[m.status]}</span></td>)}
                    <td className="cb-num prova">{c.prova}</td>
                    <td className="cb-num falta">{c.faltam || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cb-note">Prova por <b>enumeração</b> (não busca): a árvore de cada cliente ativo é varrida e cada PDF-recibo classificado. Verde-forte = recibo achado no drive com link. FGTS/eSocial/DARF ficam fora (controle no portal/banco).</p>
        </>
      )}

      <style jsx global>{`
.cb-wrap{--cb-surface:#fff;--cb-surface2:#F5F5F4;--cb-border:#E7E5E4;--cb-tx:#1C1917;--cb-tx2:#57534E;--cb-tx3:#8A857E;--cb-accent:#0F766E;--cb-ok:#2E7D5B;--cb-track:#EDEBE9;
  --cb-prova-bg:#5FBF92;--cb-prova-tx:#0B3D2A;--cb-ok-bg:#CDEAD9;--cb-ok-tx:#1C5C40;--cb-parcial-bg:#F0C270;--cb-parcial-tx:#6b470c;--cb-falta-bg:#E88A82;--cb-falta-tx:#6b1712;--cb-isenta-bg:#EDEBE9;--cb-na-bg:#F7F6F4;
  max-width:1180px;margin:0 auto;padding:22px 22px 80px;color:var(--cb-tx);font-size:14px}
.cb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
.cb-head h1{font-size:22px;font-weight:650;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
.cb-head p{color:var(--cb-tx2);margin-top:6px;max-width:720px;line-height:1.5}
.cb-badge{font-size:11px;font-weight:600;background:var(--cb-accent);color:#fff;padding:3px 9px;border-radius:20px;letter-spacing:.02em}
.cb-year{border:1px solid var(--cb-border);border-radius:10px;padding:8px 12px;font-size:14px;background:var(--cb-surface)}
.cb-load{padding:60px;text-align:center;color:var(--cb-tx3)}
.cb-vercomo{display:flex;align-items:center;gap:8px;background:var(--cb-accent);color:#fff;border-radius:12px;padding:10px 16px;margin-bottom:16px;font-size:13.5px}
.cb-vercomo b{font-weight:700}
.cb-vercomo button{margin-left:auto;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
.cb-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.cb-ring,.cb-stat{background:var(--cb-surface);border:1px solid var(--cb-border);border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(28,25,23,.05)}
.cb-ring{display:flex;align-items:center;gap:12px}
.cb-ring-n{font-size:17px;font-weight:700;fill:var(--cb-tx)}
.cb-ring-l{font-weight:600;font-size:13px}.cb-ring-s{color:var(--cb-tx3);font-size:12px;margin-top:2px;line-height:1.35}
.cb-stat .n{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
.cb-stat .l{color:var(--cb-tx2);font-size:13px;font-weight:500;margin-top:2px;display:flex;flex-direction:column}
.cb-stat .l small{color:var(--cb-tx3);font-size:11px;font-weight:400}
.cb-stat.falta .n{color:#C0362C}
.cb-toolbar{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.cb-search{flex:1;border:1px solid var(--cb-border);border-radius:10px;padding:9px 13px;font-size:14px;background:var(--cb-surface)}
.cb-check{display:flex;align-items:center;gap:6px;color:var(--cb-tx2);font-size:13px;white-space:nowrap}
.cb-count{color:var(--cb-tx3);font-size:12px;white-space:nowrap}
.cb-legend{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;font-size:12px;color:var(--cb-tx2)}
.cb-legend span{display:flex;align-items:center;gap:6px}
.cb-legend .sw{width:14px;height:14px;border-radius:4px;display:inline-block}
.sw.prova{background:var(--cb-prova-bg)}.sw.ok{background:var(--cb-ok-bg)}.sw.parcial{background:var(--cb-parcial-bg)}.sw.falta{background:var(--cb-falta-bg)}.sw.isenta{background:var(--cb-isenta-bg)}.sw.na{background:var(--cb-na-bg);border:1px solid var(--cb-border)}
.cb-tablewrap{overflow-x:auto;border:1px solid var(--cb-border);border-radius:14px;background:var(--cb-surface)}
.cb-table{border-collapse:collapse;width:100%;min-width:760px}
.cb-table thead th{position:sticky;top:0;background:var(--cb-surface2);font-size:11px;font-weight:600;color:var(--cb-tx2);padding:9px 4px;text-align:center;border-bottom:1px solid var(--cb-border)}
.cb-table th.cb-cli{text-align:left;padding-left:16px;width:38%}
.cb-cli b{display:block;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.cb-cli small{color:var(--cb-tx3);font-size:11px}
.cb-table td{padding:7px 4px;border-bottom:1px solid var(--cb-track)}
.cb-table td.cb-cli{padding-left:16px}
.cb-mc{text-align:center}
.cb-cell{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;font-size:12px;font-weight:700}
.cb-cell.prova{background:var(--cb-prova-bg);color:var(--cb-prova-tx)}
.cb-cell.ok{background:var(--cb-ok-bg);color:var(--cb-ok-tx)}
.cb-cell.parcial{background:var(--cb-parcial-bg);color:var(--cb-parcial-tx)}
.cb-cell.falta{background:var(--cb-falta-bg);color:var(--cb-falta-tx)}
.cb-cell.isenta{background:var(--cb-isenta-bg);color:var(--cb-tx3)}
.cb-cell.na{background:var(--cb-na-bg)}
.cb-num{text-align:center;font-variant-numeric:tabular-nums;font-size:12px;color:var(--cb-tx3);font-weight:600}
.cb-num.prova{color:var(--cb-ok)}.cb-num.falta{color:#C0362C}
.cb-note{color:var(--cb-tx3);font-size:12px;margin-top:12px;line-height:1.5}
@media(max-width:640px){.cb-kpis{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  );
}
