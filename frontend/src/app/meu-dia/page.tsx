'use client';
import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MESL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
type Cli = { companyId: string; cliente: string; codigo?: string; regime?: string; tipo: string; faltam: number; mesesFaltantes: number[] };
type Dados = { ano: number; clientes: Cli[]; totFaltantes?: number; clientesComFalta?: number };

export default function MeuDia() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const ano = new Date().getFullYear();
  const [cob, setCob] = useState<Record<string, any>>({});
  const [copiado, setCopiado] = useState('');

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/paineis/recibos-faltantes?ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
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
  const copiar = async (id: string, msg: string) => { try { await navigator.clipboard.writeText(msg); setCopiado(id); setTimeout(() => setCopiado(''), 1800); } catch {} };

  const comFalta = (d?.clientes ?? []).filter((c) => c.faltam > 0);
  const totFalta = comFalta.reduce((s, c) => s + c.faltam, 0);

  return (
    <div className="md-wrap">
      <header className="md-head">
        <h1>☀️ Meu Dia</h1>
        <p>Sua fila de trabalho: os clientes da <b>sua carteira</b> com documentos faltando. Cobre em um clique — quando o recibo sobe ao OneDrive, some daqui automaticamente.</p>
      </header>

      {loading ? <div className="md-load">Carregando sua carteira…</div> : !d ? <div className="md-load">Sem dados.</div> : (
        <>
          <div className="md-kpis">
            <div className="md-kpi"><div className="n">{comFalta.length}</div><div className="l">clientes a cobrar</div></div>
            <div className="md-kpi"><div className="n">{totFalta}</div><div className="l">documentos faltando</div></div>
            <div className="md-kpi ok"><div className="n">{(d.clientes?.length ?? 0) - comFalta.length}</div><div className="l">em dia ✓</div></div>
          </div>

          {comFalta.length === 0 ? (
            <div className="md-zero">🎉 Sua carteira está 100% em dia. Nada a cobrar hoje!</div>
          ) : (
            <ul className="md-list">
              {comFalta.map((c) => {
                const cb = cob[c.companyId];
                return (
                  <li key={c.companyId} className="md-item">
                    <div className="md-row">
                      <div className="md-cli">
                        <b>{c.cliente}</b>
                        <small>{c.codigo ? `#${c.codigo} · ` : ''}{c.regime} · {c.tipo}</small>
                      </div>
                      <div className="md-meses">
                        {c.mesesFaltantes.map((m) => <span key={m} className="md-tag">{MESL[m - 1]}</span>)}
                      </div>
                      <button className="md-cobrar" onClick={() => gerar(c.companyId)}>{cb ? 'Fechar' : `Cobrar (${c.faltam})`}</button>
                    </div>
                    {cb && !cb.loading && !cb.erro && (
                      <div className="md-cob">
                        <textarea readOnly value={cb.mensagem} rows={5} />
                        <div className="md-acts">
                          {cb.whatsapp ? <a className="md-wa" href={cb.whatsapp} target="_blank" rel="noopener">WhatsApp ↗</a> : <span className="md-wa off">sem WhatsApp</span>}
                          <button className="md-copy" onClick={() => copiar(c.companyId, cb.mensagem)}>{copiado === c.companyId ? '✓ copiado' : 'Copiar'}</button>
                          {cb.email ? <a className="md-copy" href={`mailto:${cb.email}?subject=${encodeURIComponent('Documentos pendentes')}&body=${encodeURIComponent(cb.mensagem)}`}>E-mail</a> : null}
                        </div>
                      </div>
                    )}
                    {cb?.loading && <div className="md-cob sm">Gerando mensagem…</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <style jsx global>{`
.md-wrap{--s:#fff;--s2:#F5F5F4;--b:#E7E5E4;--tx:#1C1917;--tx2:#57534E;--tx3:#8A857E;--ac:#0F766E;max-width:920px;margin:0 auto;padding:22px 22px 80px;color:var(--tx);font-size:14px}
.md-head h1{font-size:22px;font-weight:650}
.md-head p{color:var(--tx2);margin-top:6px;max-width:660px;line-height:1.5}
.md-load{padding:56px;text-align:center;color:var(--tx3)}
.md-kpis{display:flex;gap:14px;margin:20px 0}
.md-kpi{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:14px 20px;min-width:120px}
.md-kpi .n{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.md-kpi .l{color:var(--tx2);font-size:12px;margin-top:2px}
.md-kpi.ok .n{color:#2E7D5B}
.md-zero{background:#E4F3EC;border:1px solid #B7E0C8;color:#1C5C40;border-radius:14px;padding:22px;text-align:center;font-weight:500}
.md-list{list-style:none;display:flex;flex-direction:column;gap:10px}
.md-item{background:var(--s);border:1px solid var(--b);border-radius:14px;overflow:hidden}
.md-row{display:flex;align-items:center;gap:14px;padding:13px 16px}
.md-cli{flex:1;min-width:0}
.md-cli b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-cli small{color:var(--tx3);font-size:12px}
.md-meses{display:flex;flex-wrap:wrap;gap:5px;max-width:44%;justify-content:flex-end}
.md-tag{background:#FBE5E2;color:#C0362C;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;text-transform:capitalize}
.md-cobrar{border:none;background:var(--ac);color:#fff;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.md-cob{border-top:1px solid var(--b);padding:12px 16px;background:var(--s2)}
.md-cob.sm{color:var(--tx3);font-size:13px}
.md-cob textarea{width:100%;border:1px solid var(--b);border-radius:8px;padding:8px 10px;font-size:12px;font-family:inherit;line-height:1.45;resize:vertical;background:var(--s)}
.md-acts{display:flex;gap:8px;margin-top:8px}
.md-wa{background:#25D366;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;text-decoration:none}
.md-wa.off{background:var(--b);color:var(--tx3)}
.md-copy{border:1px solid var(--b);background:var(--s);border-radius:8px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;color:var(--tx2);text-decoration:none}
@media(max-width:640px){.md-row{flex-wrap:wrap}.md-meses{max-width:100%;justify-content:flex-start;order:3;width:100%}}
      `}</style>
    </div>
  );
}
