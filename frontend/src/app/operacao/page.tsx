'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, FileText, FileCheck, AlertTriangle, ClipboardList, ChevronRight, Search, ExternalLink, FolderOpen, Inbox } from 'lucide-react';
import { PageHeader, Card, COLORS, Kpi, StatusChip, Dot, Drawer, Btn, Spinner, EmptyState, THead, tint, StatusTone } from '@/components/ui/kit';
import { useCompetencia, fmtCompetencia } from '@/contexts/CompetenciaContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const SEM: Record<string, { dot: string; cor: string; label: string; tone: StatusTone }> = {
  verde:    { dot: COLORS.dotOk,      cor: COLORS.ok,      label: 'Em dia',  tone: 'ok' },
  amarelo:  { dot: COLORS.dotAtencao, cor: COLORS.atencao, label: 'Atenção', tone: 'atencao' },
  vermelho: { dot: COLORS.dotErro,    cor: COLORS.erro,    label: 'Crítico', tone: 'critico' },
};

export default function OperacaoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [sync, setSync] = useState<any>(null);
  const { competencia, reportResolved } = useCompetencia();

  useEffect(() => {
    fetch(`${API}/api/v1/sync-drive/status`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null)).then(setSync).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/operacao${competencia ? `?competencia=${competencia}` : ''}`, { headers: authHeaders() });
      if (r.ok) {
        const j = await r.json();
        setD(j);
        if (j.competencia) reportResolved(j.competencia);
      }
    } catch {} finally { setLoading(false); }
  }, [competencia, reportResolved]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<Inbox size={32} />} title="Sem dados de operação" sub="Verifique a conexão com o backend ou cadastre clientes." />;

  const s = d.semaforo ?? { verdes: 0, amarelos: 0, vermelhos: 0 };
  const lista = (d.clientes ?? [])
    .filter((c: any) => !filtro || c.status === filtro)
    .filter((c: any) => !busca || (c.cliente || '').toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="page">
      <PageHeader icon={<Activity size={22} color={COLORS.acao} />} title="Central de Operação"
        subtitle={`Situação da carteira em ${fmtCompetencia(d.competencia)} — clique num indicador para filtrar, num cliente para o detalhe.`}
        action={<SyncBadge sync={sync} />} />

      {!d.mesProcessado && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: tint(COLORS.dotAtencao, 10), border: `1px solid ${tint(COLORS.dotAtencao, 35)}`, borderRadius: 10, fontSize: 13, color: COLORS.atencao, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            Este mês ainda não teve os recibos verificados no drive — a coluna &quot;Declaração&quot; aparece em branco.{' '}
            <Link href="/fluxo" style={{ color: COLORS.atencao, fontWeight: 600 }}>Validar recibos no Fluxo →</Link>
          </span>
        </div>
      )}

      {/* Indicadores da competência — todos clicáveis (drill-down, nunca dead-end) */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {(['verde', 'amarelo', 'vermelho'] as const).map((k) => (
          <Kpi key={k} label={SEM[k].label} value={s[k + 's'] ?? 0} cor={SEM[k].cor}
            onClick={() => setFiltro(filtro === k ? '' : k)} active={filtro === k}
            sub={filtro === k ? 'filtrando — clique p/ limpar' : 'clique para filtrar'} />
        ))}
        <Kpi label="Declarações entregues" value={`${d.declaracoes?.entregues ?? 0}/${d.totalClientes ?? 0}`} cor={COLORS.ok}
          sub={`${d.declaracoes?.pendentes ?? 0} pendentes (recibo no drive)`} />
        <Kpi label="Inconsistências" value={d.inconsistencias?.notas ?? 0} cor={COLORS.erro}
          sub={`${d.inconsistencias?.clientes ?? 0} clientes · ${BRL(d.inconsistencias?.valor)}`} />
      </div>

      {/* Acessos por dimensão */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <Atalho icon={<FileText size={14} />} href="/organizacao"
          txt={`${(d.documentos?.total ?? 0).toLocaleString('pt-BR')} documentos · ${d.documentos?.clientesSemDocs ?? 0} clientes sem docs`} />
        <Atalho icon={<FileCheck size={14} />} href="/fluxo" txt="Quadro de trabalho e recibos" />
        <Atalho icon={<ClipboardList size={14} />} href="/solicitacoes"
          txt={`${d.pendencias?.clientes ?? 0} clientes com pendências a solicitar`} />
        <Atalho icon={<AlertTriangle size={14} />} href="/inconsistencias" txt="Malha fina completa" />
      </div>

      {/* Tabela por cliente */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.strong, margin: 0 }}>
          Situação por cliente
          <span style={{ fontWeight: 400, color: COLORS.faint, marginLeft: 8, fontSize: 13 }}>
            {lista.length} de {d.totalClientes ?? lista.length}{filtro ? ` · ${SEM[filtro].label}` : ''}
          </span>
        </h2>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: COLORS.faint }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="input-aura"
            style={{ padding: '7px 10px 7px 30px', fontSize: 13 }} />
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <THead cols={[
          { label: 'Cliente' },
          { label: 'Docs', width: 60, align: 'right' },
          { label: 'Declaração', width: 110, align: 'center' },
          { label: 'Inconsist.', width: 80, align: 'right' },
          { label: 'Pendências', width: 170 },
          { label: '', width: 24 },
        ]} />
        {lista.length === 0 && <EmptyState icon={<Search size={26} />} title="Nenhum cliente encontrado" sub="Ajuste a busca ou o filtro de status." />}
        {lista.slice(0, 200).map((c: any) => {
          const st = SEM[c.status] ?? SEM.verde;
          return (
            <div key={c.companyId} onClick={() => setSel(c)}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', fontSize: 13, transition: 'background .1s' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Dot cor={st.dot} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</div>
                  <div style={{ fontSize: 11, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
                </div>
              </div>
              <div className="num" style={{ width: 60, textAlign: 'right', paddingLeft: 8 }}>{c.docs}</div>
              <div style={{ width: 110, textAlign: 'center', paddingLeft: 8 }}>
                {c.declaracaoEntregue
                  ? <StatusChip tone="entregue" size="sm" />
                  : <span style={{ color: COLORS.faint }}>—</span>}
              </div>
              <div className="num" style={{ width: 80, textAlign: 'right', paddingLeft: 8, color: c.inconsistencias ? COLORS.erro : COLORS.faint, fontWeight: c.inconsistencias ? 700 : 400 }}>
                {c.inconsistencias || '—'}
              </div>
              <div style={{ width: 170, paddingLeft: 8, fontSize: 11.5, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(c.pendencias ?? []).slice(0, 2).join(' · ') || '—'}
              </div>
              <ChevronRight size={14} color={COLORS.faint} style={{ width: 24, flexShrink: 0 }} />
            </div>
          );
        })}
      </Card>

      {/* Drill-down em drawer — mantém o contexto da lista */}
      <Drawer open={!!sel} onClose={() => setSel(null)}
        title={sel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Dot cor={(SEM[sel.status] ?? SEM.verde).dot} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.cliente}</span>
          </div>
        )}>
        {sel && <DetalheCliente c={sel} competencia={d.competencia} />}
      </Drawer>
    </div>
  );
}

/** Chip "drive sincronizado há X min" — alimentado pelo sync agendado do backend. */
function SyncBadge({ sync }: { sync: any }) {
  if (!sync?.enabled) return null;
  const last = sync.ultimaExecucao?.finishedAt ? new Date(sync.ultimaExecucao.finishedAt) : null;
  const min = last ? Math.max(0, Math.round((Date.now() - last.getTime()) / 60000)) : null;
  const txt = sync.executandoAgora
    ? 'sincronizando o drive agora…'
    : min == null ? `sync automático a cada ${sync.intervaloMin} min`
    : min < 1 ? 'drive sincronizado agora'
    : `drive sincronizado há ${min} min`;
  const cor = sync.executandoAgora ? COLORS.info : min != null && min <= sync.intervaloMin ? COLORS.ok : COLORS.faint;
  return (
    <span title={`Varredura automática a cada ${sync.intervaloMin} min: XMLs novos, recibos e obrigações vencidas.`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, border: `1px solid ${tint(cor, 35)}`, background: tint(cor, 9), color: cor, fontSize: 12, whiteSpace: 'nowrap' }}>
      <Dot cor={cor} size={7} /> {txt}
    </span>
  );
}

function Atalho({ icon, txt, href }: { icon: any; txt: string; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.muted, fontSize: 12.5, transition: 'border-color .15s' }}>
        {icon}{txt}<ChevronRight size={12} />
      </span>
    </Link>
  );
}

/** Detalhe do cliente no drawer: por que o semáforo está nessa cor + próximas ações. */
function DetalheCliente({ c, competencia }: { c: any; competencia: string }) {
  const st = SEM[c.status] ?? SEM.verde;
  const motivos: { ok: boolean; txt: string }[] = [
    { ok: (c.docs ?? 0) > 0, txt: (c.docs ?? 0) > 0 ? `${c.docs} documentos recebidos na competência` : 'Nenhum documento recebido na competência' },
    { ok: !!c.declaracaoEntregue, txt: c.declaracaoEntregue ? 'Declaração entregue (recibo encontrado no drive)' : 'Declaração ainda sem recibo no drive' },
    { ok: !(c.inconsistencias > 0), txt: c.inconsistencias > 0 ? `${c.inconsistencias} inconsistências fiscais em notas` : 'Sem inconsistências fiscais' },
    { ok: !(c.pendencias?.length > 0), txt: c.pendencias?.length > 0 ? `${c.pendencias.length} pendências documentais` : 'Sem pendências documentais' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <StatusChip tone={st.tone} />
        <span style={{ fontSize: 12.5, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · resp.: ${c.responsavel}` : ''} · {fmtCompetencia(competencia)}</span>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: COLORS.strong, margin: '18px 0 8px' }}>Por que este status</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {motivos.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: m.ok ? COLORS.muted : COLORS.erro, padding: '7px 10px', background: m.ok ? 'transparent' : tint(COLORS.dotErro, 7), borderRadius: 8 }}>
            <Dot cor={m.ok ? COLORS.dotOk : COLORS.dotErro} size={7} />
            {m.txt}
          </div>
        ))}
      </div>

      {c.pendencias?.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: COLORS.strong, margin: '18px 0 8px' }}>Pendências</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.muted, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.pendencias.map((p: string, i: number) => <li key={i}>{p}</li>)}
          </ul>
        </>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, color: COLORS.strong, margin: '20px 0 8px' }}>Ações</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn href={`/cliente-erros?companyId=${c.companyId}`} size="sm">
          <ExternalLink size={13} /> Ficha completa e erros
        </Btn>
        <Btn href="/solicitacoes" variant="outline" size="sm">
          <ClipboardList size={13} /> Solicitar documentos
        </Btn>
        <Btn href="/organizacao" variant="outline" size="sm">
          <FolderOpen size={13} /> Ver documentos
        </Btn>
      </div>
    </div>
  );
}
