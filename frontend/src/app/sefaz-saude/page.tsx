'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
type Cli = { companyId: string; codigo?: string; nome: string; responsavel?: string; status: string; acao: string; temCert: boolean; certVenceEmDias: number | null; certEscritorio: boolean; temUF: boolean; docsSefaz: number; ultimaConsulta: string | null; cStat: string | null };
type Dados = { resumo: { total: number; ok: number; semCert: number; certVencido: number; semUF: number; semProcuracao: number; comErro: number; docsCapturados: number }; clientes: Cli[] };

const META: Record<string, { label: string; cls: string; icon: string }> = {
  ok: { label: 'Puxando', cls: 'ok', icon: '✓' },
  pronto: { label: 'Pronto', cls: 'ok', icon: '○' },
  bloqueado_656: { label: 'Aguardando (limite SEFAZ)', cls: 'wait', icon: '⏳' },
  cert_vencido: { label: 'Certificado vencido', cls: 'warn', icon: '⚠' },
  sem_cert: { label: 'Sem certificado', cls: 'bad', icon: '✕' },
  sem_uf: { label: 'Sem UF', cls: 'warn', icon: '⚠' },
  sem_procuracao: { label: 'Falta procuração', cls: 'warn', icon: '⚠' },
  erro: { label: 'Erro', cls: 'bad', icon: '!' },
};

export default function SefazSaude() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('acao'); // acao | todos
  const [busca, setBusca] = useState('');

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/sefaz/saude`, { headers: authHeaders() })
      .then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const r = d?.resumo;
  const precisaAcao = new Set(['sem_cert', 'cert_vencido', 'sem_uf', 'sem_procuracao', 'erro']);
  const clientes = useMemo(() => {
    let l = d?.clientes ?? [];
    if (filtro === 'acao') l = l.filter((c) => precisaAcao.has(c.status));
    if (busca) { const q = busca.toLowerCase(); l = l.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)); }
    return l;
  }, [d, filtro, busca]);

  return (
    <div className="ss-wrap">
      <header className="ss-head">
        <div>
          <h1>Saúde do SEFAZ</h1>
          <p>Captura automática de NF-e direto da Receita, cliente a cliente. Quem está puxando, quem precisa de ação — e o quê.</p>
        </div>
        <button onClick={carregar} className="ss-refresh">↻ Atualizar</button>
      </header>

      {loading ? <div className="ss-load">Carregando…</div> : !d ? <div className="ss-load">Sem dados.</div> : (
        <>
          <section className="ss-kpis">
            <div className="ss-kpi ok"><div className="n">{r!.ok}</div><div className="l">Puxando / prontos</div></div>
            <div className="ss-kpi bad"><div className="n">{r!.semCert}</div><div className="l">Sem certificado</div></div>
            <div className="ss-kpi warn"><div className="n">{r!.certVencido}</div><div className="l">Cert. vencido</div></div>
            <div className="ss-kpi"><div className="n">{r!.semUF + r!.semProcuracao + r!.comErro}</div><div className="l">Outros a resolver</div></div>
            <div className="ss-kpi"><div className="n">{r!.docsCapturados.toLocaleString('pt-BR')}</div><div className="l">NF-e capturadas</div></div>
          </section>

          <div className="ss-toolbar">
            <div className="ss-tabs">
              <button className={filtro === 'acao' ? 'on' : ''} onClick={() => setFiltro('acao')}>⚠ Precisam de ação ({r!.semCert + r!.certVencido + r!.semUF + r!.semProcuracao + r!.comErro})</button>
              <button className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>Todos ({r!.total})</button>
            </div>
            <input placeholder="Buscar cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} className="ss-search" />
          </div>

          {clientes.length === 0 ? <div className="ss-zero">🎉 Nada a resolver por aqui.</div> : (
            <div className="ss-tablewrap">
              <table className="ss-table">
                <thead><tr><th className="l">Cliente</th><th>Situação</th><th>Certificado</th><th>NF-e</th><th className="l">O que fazer</th></tr></thead>
                <tbody>
                  {clientes.map((c) => { const m = META[c.status] || { label: c.status, cls: '', icon: '·' }; return (
                    <tr key={c.companyId}>
                      <td className="l"><b>{c.nome}</b><small>{c.codigo ? `#${c.codigo} · ` : ''}{c.responsavel || ''}</small></td>
                      <td><span className={`ss-pill ${m.cls}`}>{m.icon} {m.label}</span></td>
                      <td className="ss-cert">{!c.temCert ? '—' : c.certVenceEmDias != null && c.certVenceEmDias < 0 ? <span className="venc">vencido</span> : c.certVenceEmDias != null && c.certVenceEmDias < 30 ? <span className="prox">vence em {c.certVenceEmDias}d</span> : <span className="ok">ok{c.certEscritorio ? ' (escr.)' : ''}</span>}</td>
                      <td className="ss-num">{c.docsSefaz || '—'}</td>
                      <td className="l ss-acao">{c.acao || '—'}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
          <p className="ss-note">A captura roda sozinha a cada ciclo. "Aguardando (limite SEFAZ)" é normal — a Receita limita ~1 consulta/hora por cliente. O certificado do <b>escritório + procuração e-CAC</b> resolve os "sem certificado" de uma vez.</p>
        </>
      )}

      <style jsx global>{`
.ss-wrap{--s:#fff;--s2:#F5F5F4;--b:#E7E5E4;--tx:#1C1917;--tx2:#57534E;--tx3:#8A857E;--ok:#2E7D5B;--warn:#B7791F;--bad:#C0362C;max-width:1120px;margin:0 auto;padding:22px 22px 80px;color:var(--tx);font-size:14px}
.ss-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
.ss-head h1{font-size:22px;font-weight:650}
.ss-head p{color:var(--tx2);margin-top:6px;max-width:660px;line-height:1.5}
.ss-refresh{border:1px solid var(--b);background:var(--s);border-radius:10px;padding:8px 14px;font-size:13px;cursor:pointer;color:var(--tx2)}
.ss-load,.ss-zero{padding:50px;text-align:center;color:var(--tx3)}
.ss-zero{background:#E4F3EC;border:1px solid #B7E0C8;color:#1C5C40;border-radius:14px;font-weight:500}
.ss-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:18px}
.ss-kpi{background:var(--s);border:1px solid var(--b);border-radius:14px;padding:14px 16px}
.ss-kpi .n{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.ss-kpi .l{color:var(--tx2);font-size:12px;margin-top:2px}
.ss-kpi.ok .n{color:var(--ok)}.ss-kpi.warn .n{color:var(--warn)}.ss-kpi.bad .n{color:var(--bad)}
.ss-toolbar{display:flex;justify-content:space-between;gap:14px;margin-bottom:12px;flex-wrap:wrap}
.ss-tabs{display:flex;gap:8px}
.ss-tabs button{border:1px solid var(--b);background:var(--s);border-radius:9px;padding:8px 14px;font-size:13px;cursor:pointer;color:var(--tx2);font-weight:500}
.ss-tabs button.on{background:var(--tx);color:#fff;border-color:var(--tx)}
.ss-search{border:1px solid var(--b);border-radius:10px;padding:8px 13px;font-size:14px;min-width:220px}
.ss-tablewrap{border:1px solid var(--b);border-radius:14px;overflow:hidden;background:var(--s)}
.ss-table{border-collapse:collapse;width:100%}
.ss-table thead th{background:var(--s2);font-size:11px;font-weight:600;color:var(--tx2);padding:10px 12px;text-align:center;border-bottom:1px solid var(--b)}
.ss-table th.l,.ss-table td.l{text-align:left}
.ss-table td{padding:11px 12px;border-bottom:1px solid #F0EEEC;text-align:center;vertical-align:middle}
.ss-table tr:last-child td{border-bottom:none}
.ss-table td.l b{font-weight:600;display:block}
.ss-table td.l small{color:var(--tx3);font-size:11px}
.ss-pill{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;white-space:nowrap}
.ss-pill.ok{background:#E4F3EC;color:var(--ok)}.ss-pill.warn{background:#FBF0DA;color:var(--warn)}.ss-pill.bad{background:#FBE5E2;color:var(--bad)}.ss-pill.wait{background:var(--s2);color:var(--tx3)}
.ss-cert .venc{color:var(--bad);font-weight:600}.ss-cert .prox{color:var(--warn);font-weight:600}.ss-cert .ok{color:var(--ok)}
.ss-num{font-variant-numeric:tabular-nums;color:var(--tx3)}
.ss-acao{font-size:12.5px;color:var(--tx2);max-width:340px}
.ss-note{color:var(--tx3);font-size:12px;margin-top:12px;line-height:1.5}
@media(max-width:720px){.ss-kpis{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
