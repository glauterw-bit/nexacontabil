'use client';
import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
type Analista = { responsavel: string; clientes: number; entregues: number; devidas: number; taxa: number; atrasados: number };
type Dados = { ano: number; analistas: Analista[] };

function tone(taxa: number) { return taxa >= 90 ? '#2E7D5B' : taxa >= 70 ? '#B7791F' : '#C0362C'; }
function Bar({ taxa }: { taxa: number }) {
  return <div className="gp-bar"><span style={{ width: `${taxa}%`, background: tone(taxa) }} /></div>;
}

export default function Gerencial() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/paineis/desempenho-analistas?ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const tot = d?.analistas.reduce((a, x) => ({ cli: a.cli + x.clientes, ent: a.ent + x.entregues, dev: a.dev + x.devidas, atr: a.atr + x.atrasados }), { cli: 0, ent: 0, dev: 0, atr: 0 });
  const taxaGeral = tot && tot.dev ? Math.round((tot.ent / tot.dev) * 100) : 0;

  return (
    <div className="gp-wrap">
      <header className="gp-head">
        <div>
          <h1>Desempenho da equipe</h1>
          <p>Taxa REAL de entrega da carteira de cada analista (obrigações entregues ÷ devidas no ano). Ordenado por quem mais precisa de atenção.</p>
        </div>
        <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} className="gp-year">
          {[new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </header>

      {loading ? <div className="gp-load">Carregando…</div> : !d ? <div className="gp-load">Sem dados.</div> : (
        <>
          <section className="gp-kpis">
            <div className="gp-kpi"><div className="n" style={{ color: tone(taxaGeral) }}>{taxaGeral}%</div><div className="l">Taxa geral do escritório</div></div>
            <div className="gp-kpi"><div className="n">{tot?.cli}</div><div className="l">Clientes ativos</div></div>
            <div className="gp-kpi"><div className="n">{d.analistas.length}</div><div className="l">Responsáveis</div></div>
            <div className="gp-kpi"><div className="n" style={{ color: '#C0362C' }}>{tot?.atr}</div><div className="l">Clientes atrasados</div></div>
          </section>

          <div className="gp-tablewrap">
            <table className="gp-table">
              <thead><tr><th className="l">Responsável</th><th>Clientes</th><th>Atrasados</th><th className="w">Taxa de entrega</th><th>Entregues / Devidas</th></tr></thead>
              <tbody>
                {d.analistas.map((a) => (
                  <tr key={a.responsavel}>
                    <td className="l"><b>{a.responsavel}</b></td>
                    <td>{a.clientes}</td>
                    <td className={a.atrasados ? 'gp-atr' : ''}>{a.atrasados || '—'}</td>
                    <td className="w"><div className="gp-taxa"><span style={{ color: tone(a.taxa), fontWeight: 700 }}>{a.taxa}%</span><Bar taxa={a.taxa} /></div></td>
                    <td className="gp-num">{a.entregues} / {a.devidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="gp-note">A taxa exclui FGTS/eSocial/DARF (controle no portal) e meses isentos (antes do cliente entrar). Verde ≥90% · âmbar 70-89% · vermelho &lt;70%.</p>
        </>
      )}

      <style jsx global>{`
.gp-wrap{--s:#fff;--s2:#F5F5F4;--b:#E7E5E4;--tx:#1C1917;--tx2:#57534E;--tx3:#8A857E;max-width:1000px;margin:0 auto;padding:22px 22px 80px;color:var(--tx);font-size:14px}
.gp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
.gp-head h1{font-size:22px;font-weight:650;letter-spacing:-.01em}
.gp-head p{color:var(--tx2);margin-top:6px;max-width:680px;line-height:1.5}
.gp-year{border:1px solid var(--b);border-radius:10px;padding:8px 12px;font-size:14px;background:var(--s)}
.gp-load{padding:60px;text-align:center;color:var(--tx3)}
.gp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.gp-kpi{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:16px 18px;box-shadow:0 1px 2px rgba(28,25,23,.05)}
.gp-kpi .n{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
.gp-kpi .l{color:var(--tx2);font-size:13px;margin-top:2px}
.gp-tablewrap{border:1px solid var(--b);border-radius:14px;background:var(--s);overflow:hidden}
.gp-table{border-collapse:collapse;width:100%}
.gp-table thead th{background:var(--s2);font-size:11px;font-weight:600;color:var(--tx2);padding:11px 12px;text-align:center;border-bottom:1px solid var(--b)}
.gp-table th.l,.gp-table td.l{text-align:left}
.gp-table th.w{width:34%}
.gp-table td{padding:12px;border-bottom:1px solid #F0EEEC;text-align:center;font-variant-numeric:tabular-nums}
.gp-table tr:last-child td{border-bottom:none}
.gp-table td.l b{font-weight:600}
.gp-atr{color:#C0362C;font-weight:600}
.gp-taxa{display:flex;align-items:center;gap:10px}
.gp-bar{flex:1;height:8px;background:var(--s2);border-radius:99px;overflow:hidden}
.gp-bar span{display:block;height:100%;border-radius:99px}
.gp-num{color:var(--tx3);font-size:13px}
.gp-note{color:var(--tx3);font-size:12px;margin-top:12px;line-height:1.5}
@media(max-width:640px){.gp-kpis{grid-template-columns:1fr 1fr}.gp-table th.w{width:auto}}
      `}</style>
    </div>
  );
}
