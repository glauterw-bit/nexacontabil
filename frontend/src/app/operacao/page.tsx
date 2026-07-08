'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Activity, FileText, FileCheck, AlertTriangle, ClipboardList, ChevronRight, Search, ExternalLink, FolderOpen, Inbox, FileX, UserCheck, X, Loader2, CheckSquare, Square } from 'lucide-react';
import { PageHeader, Card, COLORS, Kpi, StatusChip, Dot, Drawer, Btn, Spinner, EmptyState, THead, tint, StatusTone } from '@/components/ui/kit';
import { useCompetencia, fmtCompetencia } from '@/contexts/CompetenciaContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** "há X" legível a partir de uma data ISO. */
function haQuanto(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const dia = Math.round(h / 24);
  return dia === 1 ? 'ontem' : `há ${dia} dias`;
}
const dataCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null;

const SEM: Record<string, { dot: string; cor: string; label: string; tone: StatusTone }> = {
  verde:    { dot: COLORS.dotOk,      cor: COLORS.ok,      label: 'Em dia',  tone: 'ok' },
  amarelo:  { dot: COLORS.dotAtencao, cor: COLORS.atencao, label: 'Atenção', tone: 'atencao' },
  vermelho: { dot: COLORS.dotErro,    cor: COLORS.erro,    label: 'Crítico', tone: 'critico' },
};

export default function OperacaoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('');           // status: verde|amarelo|vermelho
  const [motivoFiltro, setMotivoFiltro] = useState<string>(''); // vermelho: falta_documento|erro_fiscal
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [sync, setSync] = useState<any>(null);
  // seleção em lote
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [atribuir, setAtribuir] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { competencia, reportResolved } = useCompetencia();

  useEffect(() => {
    fetch(`${API}/api/v1/sync-drive/status`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null)).then(setSync).catch(() => {});
    fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setResponsaveis(j?.nomes ?? [])).catch(() => {});
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

  const lista = useMemo(() => (d?.clientes ?? [])
    .filter((c: any) => !filtro || c.status === filtro)
    .filter((c: any) => !motivoFiltro || c.motivo === motivoFiltro)
    .filter((c: any) => !busca || (c.cliente || '').toLowerCase().includes(busca.toLowerCase())),
  [d, filtro, motivoFiltro, busca]);

  const aplicarFiltro = (status: string, motivo = '') => {
    const igual = filtro === status && motivoFiltro === motivo;
    setFiltro(igual ? '' : status);
    setMotivoFiltro(igual ? '' : motivo);
  };

  const toggle = (id: string) => setChecked((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const marcarVisiveis = () => {
    const ids = lista.slice(0, 200).map((c: any) => c.companyId);
    const todosMarcados = ids.every((id: string) => checked.has(id));
    setChecked(todosMarcados ? new Set() : new Set(ids));
  };
  const limparSel = () => setChecked(new Set());

  const atribuirLote = useCallback(async (responsavel: string) => {
    setAtribuir(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/paineis/atribuir`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ companyIds: [...checked], responsavel }),
      });
      if (r.ok) {
        const j = await r.json();
        setMsg(`${j.atualizados} cliente(s) atribuído(s) a ${responsavel}.`);
        limparSel();
        await load();
      } else setMsg('Não foi possível atribuir agora.');
    } catch { setMsg('Erro de conexão.'); }
    finally { setAtribuir(false); }
  }, [checked, load]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<Inbox size={32} />} title="Sem dados de operação" sub="Verifique a conexão com o backend ou cadastre clientes." />;

  const s = d.semaforo ?? { verdes: 0, amarelos: 0, vermelhos: 0, vermelhoFalta: 0, vermelhoErro: 0 };
  const fr = d.frescor ?? {};
  const frescorTxt = [
    dataCurta(fr.ultimoDocEm) && `último doc ${dataCurta(fr.ultimoDocEm)}`,
    haQuanto(fr.driveLidoEm) && `drive lido ${haQuanto(fr.driveLidoEm)}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="page">
      <PageHeader icon={<Activity size={22} color={COLORS.acao} />} title="Central de Operação"
        subtitle={`Situação da carteira em ${fmtCompetencia(d.competencia)} — clique num indicador para filtrar, num cliente para o detalhe.`}
        action={<SyncBadge sync={sync} />} />

      {frescorTxt && (
        <div style={{ marginTop: -8, marginBottom: 14, fontSize: 12, color: COLORS.faint, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot cor={COLORS.dotOk} size={6} /> {frescorTxt}
        </div>
      )}

      {!d.mesProcessado && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: tint(COLORS.dotAtencao, 10), border: `1px solid ${tint(COLORS.dotAtencao, 35)}`, borderRadius: 10, fontSize: 13, color: COLORS.atencao, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            Este mês ainda não teve os recibos verificados no drive — a coluna &quot;Declaração&quot; aparece em branco.{' '}
            <Link href="/fluxo" style={{ color: COLORS.atencao, fontWeight: 600 }}>Validar recibos no Fluxo →</Link>
          </span>
        </div>
      )}

      {/* Indicadores da competência — o vermelho é dividido pelo MOTIVO, porque a ação é diferente:
          falta documento → cobrar o cliente · erro fiscal → o analista corrige a nota. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Kpi label="Em dia" value={s.verdes ?? 0} cor={COLORS.ok}
          onClick={() => aplicarFiltro('verde')} active={filtro === 'verde'}
          sub={filtro === 'verde' ? 'filtrando — clique p/ limpar' : 'clique para filtrar'} />
        <Kpi label="Atenção" value={s.amarelos ?? 0} cor={COLORS.atencao}
          onClick={() => aplicarFiltro('amarelo')} active={filtro === 'amarelo'}
          sub={filtro === 'amarelo' ? 'filtrando — clique p/ limpar' : 'inconsistência leve'} />
        <Kpi label="Crítico · falta doc" value={s.vermelhoFalta ?? 0} cor={COLORS.erro}
          onClick={() => aplicarFiltro('vermelho', 'falta_documento')} active={filtro === 'vermelho' && motivoFiltro === 'falta_documento'}
          sub="cliente não enviou — cobrar" />
        <Kpi label="Crítico · erro fiscal" value={s.vermelhoErro ?? 0} cor={COLORS.erro}
          onClick={() => aplicarFiltro('vermelho', 'erro_fiscal')} active={filtro === 'vermelho' && motivoFiltro === 'erro_fiscal'}
          sub="nota com erro — corrigir" />
        <Kpi label="Declarações entregues" value={`${d.declaracoes?.entregues ?? 0}/${d.totalClientes ?? 0}`} cor={COLORS.ok}
          sub={`${d.declaracoes?.pendentes ?? 0} pendentes (recibo no drive)`} />
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

      {msg && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 9, fontSize: 13, background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}`, color: COLORS.ok }}>{msg}</div>
      )}

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
        {/* cabeçalho com checkbox mestre */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: `1px solid ${COLORS.border}`, fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.04em', background: COLORS.surface2 }}>
          <button onClick={marcarVisiveis} title="Selecionar todos visíveis" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.muted, display: 'flex', padding: 0, marginRight: 10 }}>
            {lista.length > 0 && lista.slice(0, 200).every((c: any) => checked.has(c.companyId)) ? <CheckSquare size={15} /> : <Square size={15} />}
          </button>
          <span style={{ flex: 1 }}>Cliente</span>
          <span style={{ width: 60, textAlign: 'right' }}>Docs</span>
          <span style={{ width: 110, textAlign: 'center' }}>Declaração</span>
          <span style={{ width: 80, textAlign: 'right' }}>Inconsist.</span>
          <span style={{ width: 170, paddingLeft: 8 }}>Pendências</span>
          <span style={{ width: 24 }} />
        </div>
        {lista.length === 0 && <EmptyState icon={<Search size={26} />} title="Nenhum cliente encontrado" sub="Ajuste a busca ou o filtro de status." />}
        {lista.slice(0, 200).map((c: any) => {
          const st = SEM[c.status] ?? SEM.verde;
          const marcado = checked.has(c.companyId);
          return (
            <div key={c.companyId}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = marcado ? tint(COLORS.acao, 7) : 'transparent')}
              style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13, transition: 'background .1s', background: marcado ? tint(COLORS.acao, 7) : 'transparent' }}>
              <button onClick={() => toggle(c.companyId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: marcado ? COLORS.acao : COLORS.faint, display: 'flex', padding: 0, marginRight: 10 }}>
                {marcado ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <div onClick={() => setSel(c)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}>
                <Dot cor={st.dot} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</div>
                  <div style={{ fontSize: 11, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · ${c.responsavel}` : ' · sem responsável'}</div>
                </div>
              </div>
              <div onClick={() => setSel(c)} className="num" style={{ width: 60, textAlign: 'right', paddingLeft: 8, cursor: 'pointer' }}>{c.docs}</div>
              <div onClick={() => setSel(c)} style={{ width: 110, textAlign: 'center', paddingLeft: 8, cursor: 'pointer' }}>
                {c.declaracaoEntregue
                  ? <StatusChip tone="entregue" size="sm" />
                  : <span style={{ color: COLORS.faint }}>—</span>}
              </div>
              <div onClick={() => setSel(c)} className="num" style={{ width: 80, textAlign: 'right', paddingLeft: 8, color: c.inconsistencias ? COLORS.erro : COLORS.faint, fontWeight: c.inconsistencias ? 700 : 400, cursor: 'pointer' }}>
                {c.inconsistencias || '—'}
              </div>
              <div onClick={() => setSel(c)} style={{ width: 170, paddingLeft: 8, fontSize: 11.5, color: COLORS.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {c.motivo === 'falta_documento' && <FileX size={12} color={COLORS.erro} style={{ flexShrink: 0 }} />}
                {(c.pendencias ?? []).slice(0, 2).join(' · ') || '—'}
              </div>
              <ChevronRight size={14} color={COLORS.faint} style={{ width: 24, flexShrink: 0, cursor: 'pointer' }} onClick={() => setSel(c)} />
            </div>
          );
        })}
      </Card>

      {/* Barra de ação em lote — aparece ao selecionar clientes */}
      {checked.size > 0 && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderRadius: 14,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }}>
          <span style={{ fontSize: 13, color: COLORS.strong, fontWeight: 600 }}>{checked.size} selecionado(s)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={15} color={COLORS.muted} />
            <select disabled={atribuir} defaultValue="" onChange={(e) => { if (e.target.value) atribuirLote(e.target.value); e.target.value = ''; }}
              className="input-aura" style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>
              <option value="" disabled>{atribuir ? 'atribuindo…' : 'Atribuir responsável a…'}</option>
              {responsaveis.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {atribuir && <Loader2 size={14} className="animate-spin" color={COLORS.acao} />}
          </div>
          <Link href="/solicitacoes" className="btn-secondary" style={{ fontSize: 12.5 }}>
            <ClipboardList size={13} /> Solicitar docs
          </Link>
          <button onClick={limparSel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.faint, display: 'flex' }}><X size={16} /></button>
        </div>
      )}

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
  const motivoTxt = c.motivo === 'falta_documento'
    ? 'Crítico por FALTA DE DOCUMENTO — o cliente não enviou (ou não capturamos). A ação é cobrar o cliente / reativar a entrada.'
    : c.motivo === 'erro_fiscal'
    ? 'Crítico por ERRO FISCAL — os documentos chegaram, mas há inconsistência nas notas. A ação é o analista corrigir.'
    : null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <StatusChip tone={st.tone} />
        <span style={{ fontSize: 12.5, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · resp.: ${c.responsavel}` : ''} · {fmtCompetencia(competencia)}</span>
      </div>

      {motivoTxt && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, fontSize: 12.5, background: tint(COLORS.dotErro, 8), border: `1px solid ${tint(COLORS.dotErro, 25)}`, color: COLORS.erro, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {c.motivo === 'falta_documento' ? <FileX size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{motivoTxt}</span>
        </div>
      )}

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
