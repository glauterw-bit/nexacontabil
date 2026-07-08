'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard, AlertTriangle, Lightbulb, ChevronRight, Users,
  CheckCircle2, Mail, Bell, Workflow, Inbox, Briefcase, CalendarClock, FileWarning,
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
  const { competencia } = useCompetencia();

  const load = useCallback(async () => {
    setLoading(true);
    const q = competencia ? `?competencia=${competencia}` : '';
    try {
      const [rt, rg, rc] = await Promise.all([
        fetch(`${API}/api/v1/torre-controle/overview${q}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/gerencial`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/paineis/carteira-analistas`, { headers: authHeaders() }),
      ]);
      setTorre(rt.ok ? await rt.json() : null);
      setD(rg.ok ? await rg.json() : null);
      setCa(rc.ok ? await rc.json() : null);
    } catch {} finally { setLoading(false); }
  }, [competencia]);
  useEffect(() => { load(); }, [load]);

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
function CarteiraAnalistas({ ca }: { ca: any }) {
  const t = ca.totais ?? {};
  const maxCli = Math.max(1, ...ca.analistas.map((a: any) => a.clientes));
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

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <THead cols={[
          { label: 'Analista' },
          { label: 'Clientes', width: 130 },
          { label: 'Obrigações do mês', width: 200 },
          { label: 'Vencidas', width: 80, align: 'right' },
          { label: 'Vencem 7d', width: 90, align: 'right' },
          { label: 'Qualidade', width: 120, align: 'right' },
        ]} />
        {ca.analistas.map((a: any) => {
          const entregaCor = a.pctEntrega >= 90 ? COLORS.ok : a.pctEntrega >= 70 ? COLORS.atencao : COLORS.erro;
          const erroCor = a.taxaErro > 2 ? COLORS.erro : a.taxaErro > 1 ? COLORS.atencao : COLORS.ok;
          return (
            <div key={a.responsavel} style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13, gap: 4 }}>
              {/* analista */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.responsavel}</div>
                <div style={{ fontSize: 11, color: COLORS.faint }}>{(a.docs ?? 0).toLocaleString('pt-BR')} docs processados</div>
              </div>
              {/* clientes + sem doc */}
              <div style={{ width: 130 }}>
                <div className="num" style={{ fontWeight: 600, color: COLORS.strong }}>{a.clientes}
                  {a.clientesSemDoc > 0 && <span style={{ fontWeight: 400, fontSize: 11, color: COLORS.atencao }}> · {a.clientesSemDoc} sem docs</span>}
                </div>
                <div style={{ marginTop: 4, height: 5, background: COLORS.surface2, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(a.clientes / maxCli) * 100}%`, height: '100%', background: COLORS.acao }} />
                </div>
              </div>
              {/* obrigações do mês (entregues/total + barra) */}
              <div style={{ width: 200, paddingRight: 10 }}>
                <div className="num" style={{ fontSize: 12.5 }}>
                  <strong style={{ color: entregaCor }}>{a.obrigEntregues}</strong>
                  <span style={{ color: COLORS.faint }}>/{a.obrigTotal} entregues</span>
                  {a.obrigPendentes > 0 && <span style={{ color: COLORS.atencao }}> · {a.obrigPendentes} faltam</span>}
                </div>
                <div style={{ marginTop: 4, height: 6, background: COLORS.surface2, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${a.pctEntrega}%`, height: '100%', background: entregaCor }} />
                </div>
              </div>
              {/* vencidas */}
              <div className="num" style={{ width: 80, textAlign: 'right', color: a.obrigVencidas ? COLORS.erro : COLORS.faint, fontWeight: a.obrigVencidas ? 700 : 400 }}>
                {a.obrigVencidas || '—'}
              </div>
              {/* vencem 7 dias */}
              <div className="num" style={{ width: 90, textAlign: 'right', color: a.proximas7 ? COLORS.atencao : COLORS.faint, fontWeight: a.proximas7 ? 600 : 400 }}>
                {a.proximas7 || '—'}
              </div>
              {/* qualidade (taxa de erro) */}
              <div className="num" style={{ width: 120, textAlign: 'right' }}>
                <span style={{ color: erroCor, fontWeight: 600 }}>{a.taxaErro}%</span>
                <span style={{ color: COLORS.faint, fontSize: 11 }}> erro{a.clientesComErro ? ` · ${a.clientesComErro} cli.` : ''}</span>
              </div>
            </div>
          );
        })}
      </Card>

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
