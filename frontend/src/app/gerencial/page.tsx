'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, AlertTriangle, Lightbulb, ChevronRight, Users,
  CheckCircle2, Mail, Bell, Workflow, Inbox, Briefcase, CalendarClock, FileWarning, TrendingUp,
} from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, COLORS, tint, Spinner, EmptyState, Dot, THead } from '@/components/ui/kit';
import { useCompetencia, fmtCompetencia } from '@/contexts/CompetenciaContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pctCor = (p: number) => p >= 85 ? COLORS.ok : p >= 60 ? COLORS.atencao : COLORS.erro;
const sevCor = (s: string) => s === 'alta' ? COLORS.erro : s === 'media' ? COLORS.atencao : COLORS.faint;
const sevDot = (s: string) => s === 'alta' ? COLORS.dotErro : s === 'media' ? COLORS.dotAtencao : COLORS.faint;
const quandoBR = (iso: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export default function GerencialPage() {
  const [torre, setTorre] = useState<any>(null);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ca, setCa] = useState<any>(null);
  const [em, setEm] = useState<any>(null);
  const [pan, setPan] = useState<any>(null);
  const [ten, setTen] = useState<any>(null);
  const { competencia } = useCompetencia();

  const carregarPanorama = useCallback(() => {
    fetch(`${API}/api/v1/paineis/panorama`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null).then((x) => x && setPan(x)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const q = competencia ? `?competencia=${competencia}` : '';
    try {
      const [rt, rg, rc, re] = await Promise.all([
        fetch(`${API}/api/v1/torre-controle/overview${q}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/gerencial`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/carteira-analistas`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/entregas-mensais`, { headers: authHeaders() }),
      ]);
      setTorre(rt.ok ? await rt.json() : null);
      setD(rg.ok ? await rg.json() : null);
      setCa(rc.ok ? await rc.json() : null);
      setEm(re.ok ? await re.json() : null);
      fetch(`${API}/api/v1/paineis/tendencias`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null).then((x) => x && setTen(x)).catch(() => {});
    } catch {} finally { setLoading(false); }
  }, [competencia]);
  useEffect(() => { load(); carregarPanorama(); }, [load, carregarPanorama]);
  // painel vivo: o pulso e os insights atualizam sozinhos a cada 40s
  useEffect(() => { const t = setInterval(carregarPanorama, 40000); return () => clearInterval(t); }, [carregarPanorama]);

  if (loading) return <Spinner />;
  if (!torre && !d) return <EmptyState icon={<Inbox size={32} />} title="Sem dados do escritório" sub="Verifique a conexão com o backend." />;

  const p = torre?.pulso;
  const temWorkflow = (p?.total ?? 0) > 0;
  const k = d?.kpis ?? {}; const h = d?.hero ?? {};
  const inad = p?.inadimplencia;

  return (
    <div className="page">
      <PageHeader icon={<LayoutDashboard size={22} color={COLORS.acao} />} title="Painel Gerencial"
        subtitle={`Pulso do escritório em ${fmtCompetencia(torre?.competencia ?? '')} — produção, SLA, gargalos e equipe.`} />

      {/* ── PANORAMA AO VIVO: pulso + feed de insights (atualiza sozinho) ── */}
      {pan && <PanoramaVivo pan={pan} />}

      {/* ── PULSO OPERACIONAL (torre de controle) ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        {temWorkflow ? (
          <>
            <Kpi label="Produção do mês" value={`${p.pctProducao}%`} cor={pctCor(p.pctProducao)}
              sub={`${p.concluidas}/${p.total} tarefas concluídas`} />
            <Kpi label="Dentro do SLA" value={`${p.pctSla}%`} cor={pctCor(p.pctSla)}
              sub={`${p.vencidas} vencidas · ${p.emAndamento} em andamento`} />
          </>
        ) : (
          <Kpi label="Produção do mês" value="—" sub="sem tarefas de workflow nesta competência" />
        )}
        <Kpi label="Docs processados" value={(p?.docsEnviados ?? k.docs ?? 0).toLocaleString('pt-BR')} sub={`${k.clientes ?? torre?.carga?.totalClientes ?? 0} clientes`} />
        <Kpi label="Pendências vencidas" value={p?.pendencias ?? h.atrasadas ?? 0} cor={COLORS.atencao} sub="obrigações + honorários" />
        {inad && inad.total > 0 && (
          <Kpi label="Inadimplência" value={`${inad.taxa}%`} cor={inad.taxa > 10 ? COLORS.erro : inad.taxa > 0 ? COLORS.atencao : COLORS.ok}
            sub={`${inad.vencidos} boletos · ${BRL(inad.valorVencido)}`} />
        )}
        <Kpi label="Notas com erro" value={k.notasErro ?? 0} cor={COLORS.erro} sub={`${k.clientesComErro ?? 0} clientes · ${BRL(k.valorEnvolvido)}`} />
      </div>

      {/* insights do motor */}
      {d?.insights?.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.insights.map((ins: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: 12, background: tint(COLORS.acao, 8), border: `1px solid ${tint(COLORS.acao, 30)}`, borderRadius: 10, fontSize: 13, color: COLORS.acao }}>
              <Lightbulb size={17} style={{ flexShrink: 0 }} /> {ins.texto}
            </div>
          ))}
        </div>
      )}

      {/* ── FUNIL DE ESTÁGIOS + GARGALO ── */}
      {temWorkflow && (
        <>
          <SectionTitle><Workflow size={15} color={COLORS.acao} /> Funil da competência
            {torre.gargalo && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.atencao, background: tint(COLORS.dotAtencao, 12), padding: '2px 9px', borderRadius: 999 }}>
                gargalo: {torre.gargalo.label} ({torre.gargalo.abertas} abertas)
              </span>
            )}
          </SectionTitle>
          <Card style={{ padding: '14px 16px' }}>
            {(torre.estagios ?? []).map((e: any) => {
              const frac = e.total > 0 ? e.concluidas / e.total : 0;
              const ehGargalo = torre.gargalo?.stage === e.stage;
              return (
                <div key={e.stage} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                  <div style={{ width: 190, fontSize: 12.5, fontWeight: ehGargalo ? 700 : 500, color: ehGargalo ? COLORS.atencao : COLORS.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {ehGargalo && <AlertTriangle size={12} />} {e.label}
                  </div>
                  <div style={{ flex: 1, height: 14, background: COLORS.surface2, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${frac * 100}%`, background: COLORS.dotOk, transition: 'width .3s' }} />
                    {e.vencidas > 0 && <div style={{ width: `${(e.vencidas / Math.max(1, e.total)) * 100}%`, background: COLORS.dotErro }} />}
                  </div>
                  <div className="num" style={{ width: 110, textAlign: 'right', fontSize: 12, color: COLORS.muted }}>
                    {e.concluidas}/{e.total}{e.vencidas > 0 && <span style={{ color: COLORS.erro, fontWeight: 700 }}> · {e.vencidas} venc.</span>}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {/* ── CARTEIRA DOS ANALISTAS (visão gerencial rica) ── */}
      {ca?.analistas?.length > 0 && <CarteiraAnalistas ca={ca} />}

      {/* ── TENDÊNCIAS (12 meses) ── */}
      {ten?.linha?.length > 1 && <Tendencias ten={ten} />}

      {/* ── ENTREGAS POR MÊS + acervo do ano ── */}
      {em && <EntregasMensais em={em} />}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* ── EQUIPE: produção (torre de controle, se houver workflow) ── */}
        {(torre?.analistas ?? []).length > 0 && (
          <div style={{ flex: '1 1 460px', minWidth: 0 }}>
            <SectionTitle><Users size={15} color={COLORS.acao} /> Produção (workflow do mês)</SectionTitle>
            {torre.analistas.map((a: any) => (
              <Card key={a.analystId} style={{ marginBottom: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.strong }}>{a.nome}
                      <span style={{ fontWeight: 400, fontSize: 11.5, color: COLORS.faint }}> · {a.carteira} clientes na carteira</span>
                    </div>
                    {a.total > 0 && (
                      <div style={{ marginTop: 7, height: 6, background: COLORS.surface2, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${a.pctConclusao}%`, height: '100%', background: pctCor(a.pctConclusao) }} />
                      </div>
                    )}
                  </div>
                  <div className="num" style={{ textAlign: 'right', fontSize: 12, color: COLORS.muted, flexShrink: 0 }}>
                    {a.total > 0 ? (
                      <>
                        <div><strong style={{ color: pctCor(a.pctConclusao) }}>{a.pctConclusao}%</strong> produção ({a.concluidas}/{a.total})</div>
                        <div style={{ color: a.vencidas > 0 ? COLORS.erro : COLORS.faint }}>{a.vencidas > 0 ? `${a.vencidas} vencidas` : 'SLA em dia'}</div>
                      </>
                    ) : <div style={{ color: COLORS.faint }}>sem tarefas no mês</div>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── PENDÊNCIAS + ATENÇÃO ── */}
        <div style={{ flex: '1 1 460px', minWidth: 0 }}>
          <SectionTitle><AlertTriangle size={15} color={COLORS.atencao} /> Pendências que mais esperam</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {(torre?.pendencias ?? []).slice(0, 8).map((pe: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13 }}>
                <Dot cor={sevDot(pe.severidade)} size={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pe.cliente}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pe.pendencia}{pe.responsavel ? ` · ${pe.responsavel}` : ''}</div>
                </div>
                <span className="num" style={{ fontSize: 12, fontWeight: 700, color: sevCor(pe.severidade), whiteSpace: 'nowrap' }}>{pe.diasParado}d parado</span>
              </div>
            ))}
            {(torre?.pendencias ?? []).length === 0 && (
              <div style={{ padding: 18, textAlign: 'center', color: COLORS.ok, fontSize: 13, display: 'flex', gap: 6, justifyContent: 'center' }}>
                <CheckCircle2 size={15} /> Nenhuma pendência vencida
              </div>
            )}
          </Card>

          <SectionTitle>Clientes que mais precisam de atenção</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {(d?.topClientesErro ?? []).slice(0, 6).map((c: any, i: number) => (
              <Link key={i} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13, cursor: 'pointer', transition: 'background .1s' }}>
                  <span style={{ width: 18, color: COLORS.faint, fontWeight: 700 }} className="num">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.faint }}>{c.responsavel ?? 'sem responsável'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ color: COLORS.erro, fontWeight: 700 }}>{c.erros} erros</div>
                    <div className="num" style={{ fontSize: 11.5, color: COLORS.faint }}>{BRL(c.valor)}</div>
                  </div>
                  <ChevronRight size={14} color={COLORS.faint} />
                </div>
              </Link>
            ))}
            {(d?.topClientesErro ?? []).length === 0 && (
              <div style={{ padding: 18, textAlign: 'center', color: COLORS.ok, fontSize: 13, display: 'flex', gap: 6, justifyContent: 'center' }}>
                <CheckCircle2 size={15} /> Nenhum cliente com erros relevantes
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── FLUXO AO VIVO ── */}
      {(torre?.fluxo ?? []).length > 0 && (
        <>
          <SectionTitle><Bell size={15} color={COLORS.acao} /> Acontecendo agora</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {torre.fluxo.slice(0, 10).map((f: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5 }}>
                <span style={{ color: f.tipo === 'conclusao' ? COLORS.ok : f.tipo === 'envio' ? COLORS.info : COLORS.acao, flexShrink: 0 }}>
                  {f.tipo === 'conclusao' ? <CheckCircle2 size={14} /> : f.tipo === 'envio' ? <Mail size={14} /> : <Bell size={14} />}
                </span>
                <span style={{ flex: 1, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.texto}{f.ator ? <span style={{ color: COLORS.faint }}> — {f.ator}</span> : null}</span>
                <span className="num" style={{ color: COLORS.faint, fontSize: 11.5, whiteSpace: 'nowrap' }}>{quandoBR(f.quando)}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* atalhos */}
      <SectionTitle>Acessos rápidos</SectionTitle>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { href: '/operacao', label: 'Central de Operação' },
          { href: '/inconsistencias', label: 'Inconsistências' },
          { href: '/atendimentos', label: 'Atendimento' },
          { href: '/prazos', label: 'Prazos & SLA' },
          { href: '/fluxo', label: 'Fluxo de Trabalho' },
          { href: '/atribuir-responsavel', label: 'Atribuir Responsáveis' },
        ].map((a) => (
          <Link key={a.href} href={a.href} style={{ padding: '9px 15px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontSize: 13, textDecoration: 'none', boxShadow: 'var(--shadow-card)' }}>{a.label}</Link>
        ))}
      </div>
    </div>
  );
}

/** Carteira dos analistas — clareza sobre carga, obrigações que faltam e performance. */
/** Panorama ao vivo: pulso da operação + feed de insights acionáveis (auto-refresh). */
function PanoramaVivo({ pan }: { pan: any }) {
  const p = pan.pulso ?? {}; const k = pan.kpis ?? {};
  const CORI: Record<string, { bg: string; fg: string; ic: any }> = {
    critico:      { bg: tint(COLORS.dotErro, 10),    fg: COLORS.erro,    ic: AlertTriangle },
    alerta:       { bg: tint(COLORS.dotAtencao, 10), fg: COLORS.atencao, ic: Bell },
    oportunidade: { bg: tint(COLORS.dotOk, 10),      fg: COLORS.ok,      ic: TrendingUp },
    ok:           { bg: tint(COLORS.dotOk, 8),       fg: COLORS.ok,      ic: CheckCircle2 },
  };
  return (
    <div style={{ marginBottom: 18 }}>
      {/* pulso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '10px 14px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: COLORS.strong, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: COLORS.ok, boxShadow: `0 0 0 0 ${COLORS.ok}`, animation: 'pulse 2s infinite' }} /> Ao vivo
        </span>
        <PulsoItem n={(p.docsHoje ?? 0)} label="docs capturados hoje" cor={COLORS.acao} />
        <PulsoItem n={(p.docs2026 ?? 0)} label="documentos de 2026" cor={p.docs2026 > 0 ? COLORS.ok : COLORS.erro} />
        <PulsoItem n={`${k.pctEntrega ?? 0}%`} label="obrigações entregues" cor={(k.pctEntrega ?? 0) >= 80 ? COLORS.ok : COLORS.atencao} />
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: COLORS.faint }}>
          drive lido {p.driveLidoHaMin == null ? '—' : p.driveLidoHaMin < 1 ? 'agora' : `há ${p.driveLidoHaMin} min`}
        </span>
        <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 ${tint(COLORS.dotOk, 60)}}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}`}</style>
      </div>

      {/* feed de insights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {(pan.insights ?? []).map((it: any, i: number) => {
          const c = CORI[it.nivel] ?? CORI.alerta; const Ic = c.ic;
          return (
            <Link key={i} href={it.rota} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: c.bg, border: `1px solid ${tint(c.fg, 22)}`, borderRadius: 10, alignItems: 'flex-start', height: '100%' }}>
                <Ic size={16} color={c.fg} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.strong }}>{it.titulo}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted, lineHeight: 1.35 }}>{it.texto}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
function PulsoItem({ n, label, cor }: { n: any; label: string; cor: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <b className="num" style={{ fontSize: 17, fontWeight: 800, color: cor }}>{typeof n === 'number' ? n.toLocaleString('pt-BR') : n}</b>
      <span style={{ fontSize: 11.5, color: COLORS.faint }}>{label}</span>
    </span>
  );
}

/** Tendências 12 meses — evolução de entregas, erro e movimento (o gestor vê se melhora). */
function Tendencias({ ten }: { ten: any }) {
  const linha = ten.linha ?? [];
  const v = ten.variacao ?? {};
  const maxMov = Math.max(1, ...linha.map((l: any) => l.movimento));
  const seta = (n: number, invertido = false) => {
    if (n === 0) return { t: '→', c: COLORS.faint };
    const bom = invertido ? n < 0 : n > 0;
    return { t: n > 0 ? `▲ +${n}` : `▼ ${n}`, c: bom ? COLORS.ok : COLORS.erro };
  };
  const sE = seta(v.entrega), sErr = seta(v.erro, true);
  const mesLbl = (m: string) => { const [, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1]; };
  return (
    <div style={{ marginTop: 22 }}>
      <SectionTitle><TrendingUp size={15} color={COLORS.acao} /> Tendências (12 meses)</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: COLORS.muted }}>vs mês anterior — entrega: <b style={{ color: sE.c }}>{sE.t}%</b> · erro: <b style={{ color: sErr.c }}>{sErr.t}%</b></span>
      </div>
      <Card style={{ padding: 14, overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', minWidth: 520 }}>
          {linha.map((l: any) => (
            <div key={l.mes} style={{ flex: 1, minWidth: 34, textAlign: 'center' }}>
              {/* barra dupla: entrega (verde) e erro (vermelho) */}
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'center', height: 90 }}>
                <div title={`Entrega ${l.pctEntrega}%`} style={{ width: 10, height: `${Math.max(2, l.pctEntrega)}%`, background: COLORS.ok, borderRadius: '2px 2px 0 0' }} />
                <div title={`Erro ${l.pctErro}%`} style={{ width: 10, height: `${Math.max(2, Math.min(100, l.pctErro))}%`, background: COLORS.erro, borderRadius: '2px 2px 0 0' }} />
              </div>
              <div style={{ fontSize: 10, color: COLORS.faint, marginTop: 4 }}>{mesLbl(l.mes)}</div>
              <div className="num" style={{ fontSize: 10.5, color: COLORS.muted }}>{l.documentos}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5, color: COLORS.faint }}>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, background: COLORS.ok, borderRadius: 2, marginRight: 4 }} /> % entrega</span>
          <span><span style={{ display: 'inline-block', width: 9, height: 9, background: COLORS.erro, borderRadius: 2, marginRight: 4 }} /> % notas com erro</span>
          <span style={{ marginLeft: 'auto' }}>nº abaixo = documentos do mês</span>
        </div>
      </Card>
    </div>
  );
}

/** Entregas por mês: documentos capturados + obrigações entregues, com destaque de 2026. */
function EntregasMensais({ em }: { em: any }) {
  const linha = em.linha ?? [];
  const maxDoc = Math.max(1, ...linha.map((l: any) => l.documentos));
  return (
    <div style={{ marginTop: 22 }}>
      <SectionTitle><CalendarClock size={15} color={COLORS.acao} /> Entregas e documentos por mês</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="Documentos no acervo" value={(em.totalDocs ?? 0).toLocaleString('pt-BR')} sub={`${em.semData ?? 0} sem data`} />
        <Kpi label="Documentos de 2026" value={(em.docs2026 ?? 0).toLocaleString('pt-BR')} cor={em.docs2026 > 0 ? COLORS.ok : COLORS.erro}
          sub={em.docs2026 > 0 ? 'capturados este ano' : 'nenhum ainda — puxar do drive/SEFAZ'} />
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <THead cols={[{ label: 'Mês', width: 90 }, { label: 'Documentos' }, { label: 'Obrigações entregues', width: 220, align: 'right' }]} />
        {linha.slice().reverse().map((l: any) => (
          <div key={l.mes} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13, gap: 10 }}>
            <div className="num" style={{ width: 90, color: l.mes >= '2026-01' ? COLORS.ok : COLORS.strong, fontWeight: 600 }}>{l.mes}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 8, background: COLORS.surface2, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(l.documentos / maxDoc) * 100}%`, height: '100%', background: COLORS.acao }} />
              </div>
              <span className="num" style={{ width: 60, textAlign: 'right', color: COLORS.muted }}>{l.documentos.toLocaleString('pt-BR')}</span>
            </div>
            <div style={{ width: 220, textAlign: 'right', fontSize: 12.5 }}>
              {l.obrigacoes > 0 ? (
                <span><b style={{ color: l.pctEntrega >= 90 ? COLORS.ok : l.pctEntrega >= 70 ? COLORS.atencao : COLORS.erro }}>{l.entregues}</b><span style={{ color: COLORS.faint }}>/{l.obrigacoes} ({l.pctEntrega}%)</span></span>
              ) : <span style={{ color: COLORS.faint }}>—</span>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Barra de progresso com rótulo, % e legenda — cor por faixa. */
function BarraProg({ label, pct, legenda }: { label: string; pct: number; legenda?: string }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const cor = p >= 90 ? COLORS.ok : p >= 70 ? COLORS.atencao : COLORS.erro;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
        <span style={{ color: COLORS.muted }}>{label}</span>
        <span className="num" style={{ fontWeight: 700, color: cor }}>{p}%{legenda ? <span style={{ color: COLORS.faint, fontWeight: 400 }}> · {legenda}</span> : ''}</span>
      </div>
      <div style={{ height: 7, background: COLORS.surface2, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: cor, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function CarteiraAnalistas({ ca }: { ca: any }) {
  const t = ca.totais ?? {};
  return (
    <div style={{ marginTop: 8 }}>
      <SectionTitle><Briefcase size={15} color={COLORS.acao} /> Carteira dos analistas — {fmtCompetencia(ca.competencia)}</SectionTitle>

      {/* resumo do escritório */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="Obrigações vencidas" value={t.obrigVencidas ?? 0} cor={COLORS.erro} sub="da carteira toda" />
        <Kpi label="Obrigações pendentes" value={t.obrigPendentes ?? 0} cor={COLORS.atencao} sub="a entregar neste mês" />
        <Kpi label="Vencem em 7 dias" value={t.proximas7 ?? 0} cor={COLORS.atencao} />
        <Kpi label="Clientes na carteira" value={t.clientes ?? 0} sub={`${ca.analistas.length} analistas`} />
        {t.clientesSemResponsavel > 0 && (
          <Kpi label="Sem responsável" value={t.clientesSemResponsavel} cor={COLORS.info} sub="atribuir" />
        )}
      </div>

      {/* Cards por analista — barras de Entregas, Pontualidade (tempo) e Precisão */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {ca.analistas.map((a: any) => {
          const atencao = a.clientesAtencao ?? 0;
          const acentoCor = a.obrigVencidas > 0 ? COLORS.erro : atencao > 0 ? COLORS.atencao : COLORS.ok;
          return (
            <Link key={a.responsavel} href={`/painel-analista?responsavel=${encodeURIComponent(a.responsavel)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Card accent={acentoCor} style={{ height: '100%' }}>
                {/* cabeçalho */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: tint(COLORS.acao, 12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, color: COLORS.acao, fontSize: 14 }}>
                    {(a.responsavel || '?').split(' ').map((p: string) => p[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.responsavel}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.faint }}>{a.clientes} clientes · {(a.docs ?? 0).toLocaleString('pt-BR')} docs</div>
                  </div>
                  {atencao > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: COLORS.erro, background: tint(COLORS.dotErro, 10), border: `1px solid ${tint(COLORS.dotErro, 25)}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      <AlertTriangle size={11} /> {atencao} atenção
                    </span>
                  )}
                </div>
                {/* barras */}
                <BarraProg label="Entregas" pct={a.pctEntrega} legenda={`${a.obrigEntregues}/${a.obrigTotal} obrigações`} />
                <BarraProg label="Pontualidade (prazo)" pct={a.pontualidade} legenda={a.obrigVencidas > 0 ? `${a.obrigVencidas} vencida(s)` : 'no prazo'} />
                <BarraProg label="Precisão" pct={a.precisao} legenda={a.clientesComErro > 0 ? `${a.clientesComErro} cli. c/ erro` : 'sem erro fiscal'} />
                {/* rodapé */}
                <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11.5, color: COLORS.muted }}>
                  {a.obrigVencidas > 0 && <span style={{ color: COLORS.erro }}>● {a.obrigVencidas} vencidas</span>}
                  {a.proximas7 > 0 && <span style={{ color: COLORS.atencao }}>● {a.proximas7} vencem 7d</span>}
                  {a.clientesSemDoc > 0 && <span>● {a.clientesSemDoc} sem docs</span>}
                  {a.obrigVencidas === 0 && a.proximas7 === 0 && atencao === 0 && <span style={{ color: COLORS.ok }}>● tudo em dia</span>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <Link href="/prazos" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: COLORS.acao, textDecoration: 'none' }}>
          <CalendarClock size={13} /> ver todas as obrigações e prazos <ChevronRight size={13} />
        </Link>
        <Link href="/atribuir-responsavel" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: COLORS.acao, textDecoration: 'none' }}>
          <Users size={13} /> rebalancear carteiras <ChevronRight size={13} />
        </Link>
        <Link href="/produtividade" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: COLORS.acao, textDecoration: 'none' }}>
          <FileWarning size={13} /> produtividade completa <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}
