'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
type Cli = { companyId: string; codigo?: string; nome: string; responsavel?: string; status: string; acao: string; temCert: boolean; certVenceEmDias: number | null; certEscritorio: boolean; temUF: boolean; docsSefaz: number; ultimaConsulta: string | null; cStat: string | null };
type Dados = { resumo: { total: number; ok: number; semCert: number; certVencido: number; semUF: number; semProcuracao: number; comErro: number; docsCapturados: number }; clientes: Cli[] };

const META: Record<string, { label: string; tone: string; icon: string }> = {
  ok:             { label: 'Puxando',            tone: 'g', icon: '↑' },
  pronto:         { label: 'Pronto',             tone: 'g', icon: '•' },
  bloqueado_656:  { label: 'Aguardando limite',  tone: 's', icon: '⏳' },
  cert_vencido:   { label: 'Certificado vencido', tone: 'o', icon: '⚠' },
  sem_cert:       { label: 'Sem certificado',    tone: 'r', icon: '✕' },
  sem_uf:         { label: 'Sem UF',             tone: 'a', icon: '⚑' },
  sem_procuracao: { label: 'Falta procuração',   tone: 'a', icon: '⚑' },
  erro:           { label: 'Erro',               tone: 'r', icon: '!' },
};
const ACIONAVEL = new Set(['sem_cert', 'cert_vencido', 'sem_uf', 'sem_procuracao', 'erro']);

function Donut({ segs, centro, sub }: { segs: { v: number; c: string }[]; centro: string; sub: string }) {
  const total = segs.reduce((a, s) => a + s.v, 0) || 1;
  const R = 78, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="fs-donut">
      <svg width="188" height="188" viewBox="0 0 188 188">
        <circle cx="94" cy="94" r={R} fill="none" stroke="var(--fs-track)" strokeWidth="15" />
        {segs.filter((s) => s.v > 0).map((s, i) => {
          const len = (s.v / total) * C;
          const el = <circle key={i} cx="94" cy="94" r={R} fill="none" stroke={s.c} strokeWidth="15" strokeLinecap="round"
            strokeDasharray={`${Math.max(len - 3, 0)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 94 94)" />;
          off += len; return el;
        })}
        <text x="94" y="90" textAnchor="middle" className="fs-donut-n">{centro}</text>
        <text x="94" y="112" textAnchor="middle" className="fs-donut-s">{sub}</text>
      </svg>
    </div>
  );
}

export default function SefazSaude() {
  const [d, setD] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [foco, setFoco] = useState<string>('acao'); // acao | todos | <status>
  const [busca, setBusca] = useState('');
  const [waBy, setWaBy] = useState<Record<string, string>>({}); // companyId -> link wa.me pronto

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/sefaz/saude`, { headers: authHeaders() })
      .then((r) => r.json()).then(setD).catch(() => setD(null)).finally(() => setLoading(false));
    fetch(`${API}/api/v1/sefaz/campanha-procuracoes`, { headers: authHeaders() })
      .then((r) => r.json()).then((c) => {
        const m: Record<string, string> = {};
        (c?.itens ?? []).forEach((i: any) => { if (i.whatsapp) m[i.companyId] = i.whatsapp; });
        setWaBy(m);
      }).catch(() => setWaBy({}));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const g = useMemo(() => {
    const cl = d?.clientes ?? [];
    const by = (s: string) => cl.filter((c) => c.status === s).length;
    const puxando = by('ok'), cooldown = by('pronto') + by('bloqueado_656'), semCert = by('sem_cert'),
      vencido = by('cert_vencido'), outros = by('sem_uf') + by('sem_procuracao') + by('erro');
    return { puxando, cooldown, semCert, vencido, outros, acionaveis: semCert + vencido + outros };
  }, [d]);

  const clientes = useMemo(() => {
    let l = d?.clientes ?? [];
    if (foco === 'acao') l = l.filter((c) => ACIONAVEL.has(c.status));
    else if (foco !== 'todos') l = l.filter((c) => c.status === foco);
    if (busca) { const q = busca.toLowerCase(); l = l.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)); }
    return l;
  }, [d, foco, busca]);

  const total = d?.resumo.total ?? 0;
  const pctPuxando = total ? Math.round((g.puxando / total) * 100) : 0;

  return (
    <div className="fs-wrap">
      <header className="fs-head">
        <div>
          <div className="fs-eyebrow">Integração Receita Federal</div>
          <h1>Farol do SEFAZ</h1>
          <p>Captura automática de NF-e, cliente a cliente. Veja quem já está puxando e exatamente o que falta para os demais.</p>
        </div>
        <button onClick={carregar} className="fs-refresh" title="Atualizar">↻</button>
      </header>

      {loading ? <div className="fs-load"><span className="fs-spin" />Carregando o farol…</div> : !d ? <div className="fs-load">Não foi possível carregar.</div> : (
        <>
          {/* HERO */}
          <section className="fs-hero">
            <Donut
              centro={`${g.puxando}`}
              sub={`de ${total} puxando`}
              segs={[
                { v: g.puxando, c: 'var(--fs-g)' },
                { v: g.cooldown, c: 'var(--fs-s)' },
                { v: g.vencido, c: 'var(--fs-o)' },
                { v: g.outros, c: 'var(--fs-a)' },
                { v: g.semCert, c: 'var(--fs-r)' },
              ]}
            />
            <div className="fs-hero-right">
              <div className="fs-hero-top">
                <div className="fs-big"><span className="fs-big-n">{pctPuxando}%</span> da carteira ativa capturando</div>
                <div className="fs-docs"><b>{d.resumo.docsCapturados.toLocaleString('pt-BR')}</b> NF-e já capturadas da Receita</div>
              </div>
              <div className="fs-legend">
                <Leg c="g" n={g.puxando} t="Puxando" />
                <Leg c="s" n={g.cooldown} t="Aguardando limite" hint="~1 consulta/h" />
                <Leg c="o" n={g.vencido} t="Cert. vencido" />
                <Leg c="a" n={g.outros} t="Outros" />
                <Leg c="r" n={g.semCert} t="Sem certificado" />
              </div>
            </div>
          </section>

          {/* AÇÃO NECESSÁRIA */}
          {g.acionaveis > 0 && (
            <section className="fs-acoes">
              <div className="fs-acoes-h">Precisam de ação <span>{g.acionaveis}</span></div>
              <div className="fs-acoes-grid">
                <Acao ativo={foco === 'sem_cert'} onClick={() => setFoco(foco === 'sem_cert' ? 'acao' : 'sem_cert')} tone="r" n={g.semCert} titulo="Sem certificado" desc="Subir o A1 do cliente ou usar o cert do escritório + procuração e-CAC" />
                <Acao ativo={foco === 'cert_vencido'} onClick={() => setFoco(foco === 'cert_vencido' ? 'acao' : 'cert_vencido')} tone="o" n={g.vencido} titulo="Certificado vencido" desc="Renovar o certificado A1 do cliente" />
                <Acao ativo={foco === 'sem_uf'} onClick={() => setFoco(foco === 'sem_uf' ? 'acao' : 'sem_uf')} tone="a" n={d.resumo.semUF} titulo="Sem UF" desc="Preencher o estado do cliente" />
              </div>
            </section>
          )}

          {/* TABELA */}
          <div className="fs-toolbar">
            <div className="fs-tabs">
              <button className={foco === 'acao' || ACIONAVEL.has(foco) ? 'on' : ''} onClick={() => setFoco('acao')}>Precisam de ação</button>
              <button className={foco === 'ok' ? 'on' : ''} onClick={() => setFoco('ok')}>Puxando</button>
              <button className={foco === 'todos' ? 'on' : ''} onClick={() => setFoco('todos')}>Todos</button>
            </div>
            <div className="fs-searchwrap"><span>⌕</span><input placeholder="Buscar cliente ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          </div>

          {clientes.length === 0 ? (
            <div className="fs-zero">🎉 Nada a resolver aqui — carteira em dia.</div>
          ) : (
            <div className="fs-cards">
              {clientes.map((c) => { const m = META[c.status] || { label: c.status, tone: 's', icon: '·' };
                return (
                  <div key={c.companyId} className={`fs-card t-${m.tone}`}>
                    <div className="fs-card-l">
                      <span className={`fs-dot t-${m.tone}`}>{m.icon}</span>
                      <div className="fs-card-cli">
                        <b title={c.nome}>{c.nome}</b>
                        <small>{c.codigo ? `#${c.codigo}` : ''}{c.responsavel ? ` · ${c.responsavel}` : ''}{c.docsSefaz ? ` · ${c.docsSefaz} NF-e` : ''}</small>
                      </div>
                    </div>
                    <div className="fs-card-r">
                      <span className={`fs-status t-${m.tone}`}>{m.label}</span>
                      {c.temCert && c.certVenceEmDias != null && (
                        <span className={`fs-cert ${c.certVenceEmDias < 0 ? 'venc' : c.certVenceEmDias < 30 ? 'prox' : 'ok'}`}>
                          {c.certVenceEmDias < 0 ? 'cert vencido' : c.certVenceEmDias < 30 ? `vence em ${c.certVenceEmDias}d` : `cert ok${c.certEscritorio ? ' · escr.' : ''}`}
                        </span>
                      )}
                      {c.acao ? <span className="fs-acaotxt">{c.acao}</span> : null}
                      {waBy[c.companyId] ? (
                        <a className="fs-cobrar" href={waBy[c.companyId]} target="_blank" rel="noopener" title="Abre o WhatsApp com a mensagem pronta pedindo a procuração/certificado">💬 Cobrar procuração</a>
                      ) : null}
                    </div>
                  </div>
                ); })}
            </div>
          )}
          <p className="fs-note">A captura roda sozinha a cada ciclo. <b>Aguardando limite</b> é normal — a Receita permite ~1 consulta por hora por cliente. Configurar o <b>certificado do escritório + procuração e-CAC</b> resolve os "sem certificado" em bloco.</p>
        </>
      )}

      <style jsx global>{`
:root{ --fs-bg:#FAFAF9; --fs-card:#fff; --fs-b:#ECEAE7; --fs-ink:#1C1917; --fs-ink2:#57534E; --fs-ink3:#9C9791; --fs-track:#EEECE9;
  --fs-g:#059669; --fs-g-bg:#E7F4EE; --fs-o:#EA7C0B; --fs-o-bg:#FBEEDD; --fs-r:#E11D48; --fs-r-bg:#FCE7EB; --fs-a:#CA8A04; --fs-a-bg:#FBF3DA; --fs-s:#78716C; --fs-s-bg:#F1EFEC; }
@media (prefers-color-scheme: dark){ :root[data-theme="dark"]{} }
.fs-wrap{max-width:1080px;margin:0 auto;padding:26px 24px 90px;color:var(--fs-ink);font-size:14px;-webkit-font-smoothing:antialiased}
.fs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:22px}
.fs-eyebrow{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--fs-g)}
.fs-head h1{font-size:26px;font-weight:700;letter-spacing:-.02em;margin-top:3px}
.fs-head p{color:var(--fs-ink2);margin-top:7px;max-width:600px;line-height:1.55}
.fs-refresh{flex-shrink:0;width:42px;height:42px;border:1px solid var(--fs-b);background:var(--fs-card);border-radius:12px;font-size:18px;cursor:pointer;color:var(--fs-ink2);transition:.15s}
.fs-refresh:hover{background:var(--fs-g-bg);color:var(--fs-g);border-color:var(--fs-g)}
.fs-load{display:flex;align-items:center;justify-content:center;gap:10px;padding:80px;color:var(--fs-ink3)}
.fs-spin{width:16px;height:16px;border:2px solid var(--fs-track);border-top-color:var(--fs-g);border-radius:50%;animation:fsspin .7s linear infinite}
@keyframes fsspin{to{transform:rotate(360deg)}}

/* HERO */
.fs-hero{display:flex;align-items:center;gap:34px;background:var(--fs-card);border:1px solid var(--fs-b);border-radius:22px;padding:26px 30px;margin-bottom:20px;box-shadow:0 1px 3px rgba(28,25,23,.04)}
.fs-donut{flex-shrink:0}
.fs-donut-n{font-size:44px;font-weight:800;fill:var(--fs-ink);font-variant-numeric:tabular-nums}
.fs-donut-s{font-size:13px;fill:var(--fs-ink3);font-weight:500}
.fs-hero-right{flex:1;min-width:0}
.fs-hero-top{margin-bottom:18px}
.fs-big{font-size:16px;color:var(--fs-ink2);font-weight:500}
.fs-big-n{font-size:26px;font-weight:800;color:var(--fs-ink);letter-spacing:-.01em}
.fs-docs{margin-top:4px;color:var(--fs-ink3);font-size:13px}
.fs-docs b{color:var(--fs-ink2);font-weight:700}
.fs-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.fs-leg{display:flex;align-items:center;gap:9px;background:var(--fs-bg);border-radius:11px;padding:9px 11px}
.fs-leg .sw{width:11px;height:11px;border-radius:4px;flex-shrink:0}
.fs-leg .n{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.fs-leg .t{font-size:11.5px;color:var(--fs-ink2);line-height:1.15}
.fs-leg .t small{display:block;color:var(--fs-ink3);font-size:10px}
.sw.t-g{background:var(--fs-g)}.sw.t-o{background:var(--fs-o)}.sw.t-r{background:var(--fs-r)}.sw.t-a{background:var(--fs-a)}.sw.t-s{background:var(--fs-s)}

/* AÇÕES */
.fs-acoes{margin-bottom:22px}
.fs-acoes-h{font-size:13px;font-weight:700;color:var(--fs-ink2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:11px;display:flex;align-items:center;gap:9px}
.fs-acoes-h span{background:var(--fs-r);color:#fff;border-radius:20px;padding:1px 9px;font-size:12px}
.fs-acoes-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px}
.fs-cobrar{margin-top:6px;display:inline-block;background:#E7F4EE;color:#059669;border:1px solid #A7D9C4;border-radius:9px;padding:5px 11px;font-size:12px;font-weight:600;text-decoration:none;transition:.15s}
.fs-cobrar:hover{background:#059669;color:#fff;border-color:#059669}
.fs-acao{text-align:left;border:1px solid var(--fs-b);background:var(--fs-card);border-radius:16px;padding:16px 17px;cursor:pointer;transition:.15s;position:relative;overflow:hidden}
.fs-acao:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(28,25,23,.08)}
.fs-acao.on{border-width:2px;padding:15px 16px}
.fs-acao::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px}
.fs-acao.t-r::before{background:var(--fs-r)} .fs-acao.t-o::before{background:var(--fs-o)} .fs-acao.t-a::before{background:var(--fs-a)}
.fs-acao.t-r.on{border-color:var(--fs-r)} .fs-acao.t-o.on{border-color:var(--fs-o)} .fs-acao.t-a.on{border-color:var(--fs-a)}
.fs-acao-n{font-size:30px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.fs-acao.t-r .fs-acao-n{color:var(--fs-r)} .fs-acao.t-o .fs-acao-n{color:var(--fs-o)} .fs-acao.t-a .fs-acao-n{color:var(--fs-a)}
.fs-acao-t{font-weight:700;margin-top:6px;font-size:14px}
.fs-acao-d{color:var(--fs-ink3);font-size:12px;margin-top:3px;line-height:1.4}
.fs-acao-cta{margin-top:9px;font-size:11.5px;font-weight:600;color:var(--fs-ink2)}

/* TOOLBAR */
.fs-toolbar{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap}
.fs-tabs{display:inline-flex;background:var(--fs-track);border-radius:11px;padding:3px}
.fs-tabs button{border:none;background:transparent;border-radius:9px;padding:8px 15px;font-size:13px;font-weight:600;cursor:pointer;color:var(--fs-ink2);transition:.12s}
.fs-tabs button.on{background:var(--fs-card);color:var(--fs-ink);box-shadow:0 1px 2px rgba(28,25,23,.08)}
.fs-searchwrap{display:flex;align-items:center;gap:8px;border:1px solid var(--fs-b);background:var(--fs-card);border-radius:11px;padding:0 12px;min-width:230px;flex:1;max-width:320px}
.fs-searchwrap span{color:var(--fs-ink3);font-size:16px}
.fs-searchwrap input{border:none;background:none;padding:10px 0;font-size:14px;width:100%;outline:none;color:var(--fs-ink)}

/* CARDS (linhas) */
.fs-zero{background:var(--fs-g-bg);border:1px solid var(--fs-g);color:var(--fs-g);border-radius:16px;padding:26px;text-align:center;font-weight:600}
.fs-cards{display:flex;flex-direction:column;gap:8px}
.fs-card{display:flex;justify-content:space-between;align-items:center;gap:16px;background:var(--fs-card);border:1px solid var(--fs-b);border-radius:14px;padding:13px 16px;transition:.12s}
.fs-card:hover{border-color:var(--fs-ink3)}
.fs-card-l{display:flex;align-items:center;gap:13px;min-width:0}
.fs-dot{flex-shrink:0;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.fs-dot.t-g{background:var(--fs-g-bg);color:var(--fs-g)} .fs-dot.t-o{background:var(--fs-o-bg);color:var(--fs-o)} .fs-dot.t-r{background:var(--fs-r-bg);color:var(--fs-r)} .fs-dot.t-a{background:var(--fs-a-bg);color:var(--fs-a)} .fs-dot.t-s{background:var(--fs-s-bg);color:var(--fs-s)}
.fs-card-cli{min-width:0}
.fs-card-cli b{font-weight:650;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:280px}
.fs-card-cli small{color:var(--fs-ink3);font-size:12px}
.fs-card-r{display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.fs-status{font-size:12px;font-weight:700;padding:4px 11px;border-radius:20px;white-space:nowrap}
.fs-status.t-g{background:var(--fs-g-bg);color:var(--fs-g)} .fs-status.t-o{background:var(--fs-o-bg);color:var(--fs-o)} .fs-status.t-r{background:var(--fs-r-bg);color:var(--fs-r)} .fs-status.t-a{background:var(--fs-a-bg);color:var(--fs-a)} .fs-status.t-s{background:var(--fs-s-bg);color:var(--fs-s)}
.fs-cert{font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--fs-bg);color:var(--fs-ink3)}
.fs-cert.venc{color:var(--fs-r);background:var(--fs-r-bg)} .fs-cert.prox{color:var(--fs-o);background:var(--fs-o-bg)} .fs-cert.ok{color:var(--fs-g)}
.fs-acaotxt{font-size:12px;color:var(--fs-ink2);max-width:300px;text-align:right;line-height:1.35}
.fs-note{color:var(--fs-ink3);font-size:12px;margin-top:16px;line-height:1.55}
@media(max-width:720px){
  .fs-hero{flex-direction:column;text-align:center}
  .fs-legend{grid-template-columns:1fr 1fr}
  .fs-card{flex-direction:column;align-items:flex-start;gap:10px}
  .fs-card-r{justify-content:flex-start}
  .fs-acaotxt{text-align:left;max-width:none}
}
      `}</style>
    </div>
  );
}

function Leg({ c, n, t, hint }: { c: string; n: number; t: string; hint?: string }) {
  return <div className="fs-leg"><span className={`sw t-${c}`} /><span className="n">{n}</span><span className="t">{t}{hint ? <small>{hint}</small> : null}</span></div>;
}
function Acao({ tone, n, titulo, desc, ativo, onClick }: { tone: string; n: number; titulo: string; desc: string; ativo: boolean; onClick: () => void }) {
  return (
    <button className={`fs-acao t-${tone} ${ativo ? 'on' : ''}`} onClick={onClick}>
      <div className="fs-acao-n">{n}</div>
      <div className="fs-acao-t">{titulo}</div>
      <div className="fs-acao-d">{desc}</div>
      <div className="fs-acao-cta">{ativo ? '✓ filtrando — clique p/ limpar' : 'Ver esses clientes →'}</div>
    </button>
  );
}
