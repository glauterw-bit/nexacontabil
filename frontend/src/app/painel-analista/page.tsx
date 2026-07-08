'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserCheck, RefreshCw, AlertTriangle, CheckCircle2, HardDriveDownload,
  CalendarClock, FileWarning, ChevronRight, Info, HelpCircle,
} from 'lucide-react';
import { PageHeader, Card, Kpi, COLORS, tint, Spinner, EmptyState, StatusChip, Dot, THead, StatusTone } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const hoursAgo = (d: any) => {
  if (!d) return null;
  const h = Math.round((Date.now() - new Date(d).getTime()) / 3600000);
  if (h < 1) return 'agora há pouco';
  if (h < 24) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
};

const URG: Record<string, { tone: StatusTone; label: string; cor: string; dot: string }> = {
  critica: { tone: 'critico', label: 'Crítica', cor: COLORS.erro, dot: COLORS.dotErro },
  alta:    { tone: 'atencao', label: 'Alta',    cor: COLORS.atencao, dot: COLORS.dotAtencao },
  media:   { tone: 'pendente', label: 'Média',  cor: COLORS.faint, dot: COLORS.faint },
  ok:      { tone: 'ok',      label: 'Em dia',   cor: COLORS.ok, dot: COLORS.dotOk },
};
const DRIVE: Record<string, { cor: string; label: string }> = {
  ok:            { cor: COLORS.ok,      label: 'atualizado' },
  desatualizado: { cor: COLORS.atencao, label: 'desatualizado' },
  nunca:         { cor: COLORS.erro,    label: 'nunca lido' },
  sem_pasta:     { cor: COLORS.faint,   label: 'sem pasta' },
};

function Conteudo() {
  const params = useSearchParams();
  const router = useRouter();
  const analistaParam = params.get('responsavel') ?? '';
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${API}/api/v1/paineis/painel-analista${analistaParam ? `?responsavel=${encodeURIComponent(analistaParam)}` : ''}`;
      const r = await fetch(url, { headers: authHeaders() });
      if (r.ok) setD(await r.json());
    } catch {} finally { setLoading(false); }
  }, [analistaParam]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<UserCheck size={32} />} title="Sem dados" sub="Verifique a conexão com o backend." />;

  const trocar = (nome: string) => router.push(`/painel-analista?responsavel=${encodeURIComponent(nome)}`);

  // sem analista escolhido → escolher
  if (d.escolher || !analistaParam) {
    return (
      <div className="page-narrow">
        <PageHeader icon={<UserCheck size={22} color={COLORS.acao} />} title="Painel do Analista"
          subtitle="Abra a carteira de um analista para ver todos os clientes, pendências e urgências." />
        <Card>
          <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }}>Escolha o analista:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(d.analistas ?? []).map((n: string) => (
              <button key={n} onClick={() => trocar(n)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', padding: '11px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.surface2, color: COLORS.strong, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                {n} <ChevronRight size={15} color={COLORS.faint} />
              </button>
            ))}
            {(d.analistas ?? []).length === 0 && <EmptyState icon={<UserCheck size={26} />} title="Nenhum analista com carteira" sub="Atribua responsáveis aos clientes primeiro." />}
          </div>
        </Card>
      </div>
    );
  }

  const r = d.resumo ?? {};
  const dr = d.drive ?? {};

  return (
    <div className="page">
      <PageHeader icon={<UserCheck size={22} color={COLORS.acao} />} title={`Painel de ${d.responsavel}`}
        subtitle="Carteira completa, priorizada por urgência — pendências, obrigações e frescor do drive."
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={d.responsavel} onChange={(e) => trocar(e.target.value)} className="input-aura" style={{ fontSize: 13 }}>
              {(d.analistas ?? []).map((n: string) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={load} className="btn-secondary" title="Recarregar"><RefreshCw size={14} /></button>
          </div>
        } />

      {/* GARANTIA DE LEITURA DO DRIVE */}
      <Card accent={dr.desatualizado + dr.nunca > 0 ? COLORS.dotAtencao : COLORS.dotOk} style={{ marginBottom: 14, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <HardDriveDownload size={20} color={dr.desatualizado + dr.nunca > 0 ? COLORS.atencao : COLORS.ok} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.strong }}>Leitura do drive</div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              A varredura roda sozinha a cada 15 min. &quot;Atualizado&quot; = lido nos últimos {dr.diasStale} dias.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12.5, flexWrap: 'wrap' }}>
            <span style={{ color: COLORS.ok }}><strong className="num">{dr.ok}</strong> atualizados</span>
            {dr.desatualizado > 0 && <span style={{ color: COLORS.atencao }}><strong className="num">{dr.desatualizado}</strong> desatualizados</span>}
            {dr.nunca > 0 && <span style={{ color: COLORS.erro }}><strong className="num">{dr.nunca}</strong> nunca lidos</span>}
            {dr.semPasta > 0 && <span style={{ color: COLORS.faint }}><strong className="num">{dr.semPasta}</strong> sem pasta</span>}
          </div>
        </div>
      </Card>

      {/* KPIs de urgência */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Kpi label="Clientes na carteira" value={r.clientes ?? 0} />
        <Kpi label="Urgência crítica" value={r.criticos ?? 0} cor={COLORS.erro} sub="obrigação vencida" />
        <Kpi label="Urgência alta" value={r.altos ?? 0} cor={COLORS.atencao} sub="vence em 7 dias / erros" />
        <Kpi label="Obrigações vencidas" value={r.obrigVencidas ?? 0} cor={COLORS.erro} />
        <Kpi label="Com inconsistência" value={r.comInconsistencia ?? 0} cor={COLORS.atencao} />
      </div>

      {/* explicação breve do que é inconsistência */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: tint(COLORS.info, 8), border: `1px solid ${tint(COLORS.info, 25)}`, borderRadius: 10, fontSize: 12.5, color: COLORS.muted, margin: '10px 0 16px' }}>
        <Info size={16} color={COLORS.info} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong style={{ color: COLORS.strong }}>O que é uma inconsistência fiscal?</strong> É uma nota do cliente cujo imposto
          não bate com a regra do produto (NCM) — ex.: ICMS/PIS/COFINS destacado a mais ou a menos, CST/CFOP incorreto.
          Não é erro de digitação: indica tributo pago errado, que pode virar autuação ou recuperação de valor.
          Abra a ficha do cliente para ver <em>o que é</em> e <em>como corrigir</em> nota a nota.
        </span>
      </div>

      {/* TABELA DE CLIENTES */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <THead cols={[
          { label: 'Cliente' },
          { label: 'Urgência', width: 100 },
          { label: 'Drive', width: 120 },
          { label: 'Obrigações', width: 150 },
          { label: 'Inconsist.', width: 90, align: 'right' },
          { label: '', width: 24 },
        ]} />
        {d.clientes.length === 0 && <EmptyState icon={<CheckCircle2 size={26} />} title="Carteira sem clientes" />}
        {d.clientes.map((c: any) => {
          const u = URG[c.urgencia] ?? URG.ok;
          const drv = DRIVE[c.drive] ?? DRIVE.ok;
          const aberto = expandido === c.companyId;
          return (
            <div key={c.companyId} style={{ borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <div onClick={() => setExpandido(aberto ? null : c.companyId)}
                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', fontSize: 13, transition: 'background .1s' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Dot cor={u.dot} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</div>
                    <div style={{ fontSize: 11, color: COLORS.faint }}>{c.regime} · {c.docs} docs</div>
                  </div>
                </div>
                <div style={{ width: 100 }}><StatusChip tone={u.tone} size="sm" label={u.label} /></div>
                <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Dot cor={drv.cor} size={7} />
                  <span style={{ fontSize: 11.5, color: drv.cor }}>{drv.label}</span>
                  {c.driveLidoEm && <span style={{ fontSize: 10.5, color: COLORS.faint }}>{hoursAgo(c.driveLidoEm)}</span>}
                </div>
                <div style={{ width: 150, fontSize: 12 }}>
                  {c.obrigVencidas > 0 && <span style={{ color: COLORS.erro, fontWeight: 700 }} className="num">{c.obrigVencidas} vencida(s)</span>}
                  {c.obrigVencidas > 0 && (c.obrigProximas7 > 0 || c.obrigPendentes > c.obrigVencidas) && ' · '}
                  {c.obrigProximas7 > 0 && <span style={{ color: COLORS.atencao }} className="num">{c.obrigProximas7} em 7d</span>}
                  {c.obrigVencidas === 0 && c.obrigProximas7 === 0 && c.obrigPendentes > 0 && <span style={{ color: COLORS.muted }} className="num">{c.obrigPendentes} a entregar</span>}
                  {c.obrigPendentes === 0 && <span style={{ color: COLORS.faint }}>—</span>}
                </div>
                <div className="num" style={{ width: 90, textAlign: 'right', color: c.inconsistencias ? COLORS.erro : COLORS.faint, fontWeight: c.inconsistencias ? 700 : 400 }}>
                  {c.inconsistencias || '—'}
                </div>
                <ChevronRight size={14} color={COLORS.faint} style={{ width: 24, flexShrink: 0, transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
              </div>

              {/* detalhe expandido */}
              {aberto && (
                <div style={{ padding: '4px 14px 14px 36px', background: COLORS.surface2 }}>
                  {c.pendencias.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Pendências</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.pendencias.map((p: string, i: number) => (
                          <span key={i} className="chip" style={{ background: tint(COLORS.dotAtencao, 10), color: COLORS.atencao }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.obrigItens?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Obrigações urgentes</div>
                      {c.obrigItens.map((o: any, i: number) => (
                        <div key={i} style={{ fontSize: 12.5, color: COLORS.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CalendarClock size={12} /> {o.tipo} — vence {dataBR(o.venc)}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.incExemplos?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>
                        O que está inconsistente
                      </div>
                      {c.incExemplos.map((t: string, i: number) => (
                        <div key={i} style={{ fontSize: 12.5, color: COLORS.text, display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                          <FileWarning size={12} color={COLORS.erro} style={{ flexShrink: 0, marginTop: 2 }} /> {t}
                        </div>
                      ))}
                      {c.inconsistencias > c.incExemplos.length && (
                        <div style={{ fontSize: 11.5, color: COLORS.faint, marginTop: 2 }}>+ {c.inconsistencias - c.incExemplos.length} outras</div>
                      )}
                    </div>
                  )}
                  <Link href={`/cliente-erros?companyId=${c.companyId}`} className="btn-primary" style={{ fontSize: 12.5 }}>
                    <HelpCircle size={13} /> Ver ficha: o que é e como corrigir
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

export default function PainelAnalistaPage() {
  return <Suspense fallback={<Spinner />}><Conteudo /></Suspense>;
}
