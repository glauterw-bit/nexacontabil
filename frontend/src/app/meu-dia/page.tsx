'use client';
import { useEffect, useState, useCallback } from 'react';
import { Sun, CalendarClock, FileWarning, CheckCircle2, Building2, ChevronRight, FileX, ClipboardList, Circle } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, Card, COLORS, Kpi, Spinner, tint } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

export default function MeuDiaPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analista, setAnalista] = useState('');
  const [nomes, setNomes] = useState<string[]>([]);
  const [ehAnalista, setEhAnalista] = useState(false);
  const [cobrancas, setCobrancas] = useState<any[]>([]);

  const carregarCobrancas = useCallback(() => {
    const qs = analista ? `?responsavel=${encodeURIComponent(analista)}&status=aberta` : '?status=aberta';
    fetch(`${API}/api/v1/cobrancas${qs}`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : []).then((x) => setCobrancas(Array.isArray(x) ? x.filter((c) => c.status !== 'concluida') : [])).catch(() => {});
  }, [analista]);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('aura_user') || '{}');
      if (u?.role === 'analista') setEhAnalista(true);
    } catch {}
    fetch(`${API}/api/v1/paineis/responsaveis`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then((d) => d && setNomes(d.nomes ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = `${API}/api/v1/paineis/meu-dia${analista ? `?responsavel=${encodeURIComponent(analista)}` : ''}`;
      const r = await fetch(u, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, [analista]);
  useEffect(() => { load(); carregarCobrancas(); }, [load, carregarCobrancas]);

  async function concluir(id: string) {
    await fetch(`${API}/api/v1/cobrancas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ status: 'concluida' }) });
    carregarCobrancas();
  }

  if (loading) return <Spinner />;
  const r = data?.resumo ?? {};
  const cor = (p: string) => p === 'alta' ? COLORS.erro : p === 'media' ? COLORS.atencao : COLORS.faint;
  const dot = (p: string) => p === 'alta' ? COLORS.dotErro : p === 'media' ? COLORS.dotAtencao : COLORS.faint;
  const ico = (t: string) => t === 'obrigacao' ? <CalendarClock size={16} /> : t === 'inconsistencia' ? <FileWarning size={16} /> : t === 'sem_documento' ? <FileX size={16} /> : <Building2 size={16} />;

  return (
    <div className="page">
      <PageHeader icon={<Sun size={22} color={COLORS.atencao} />} title="Meu Dia"
        subtitle={`Tudo que precisa de ação agora, priorizado.${ehAnalista && data?.responsavel ? ` (${data.responsavel})` : ''}`}
        action={!ehAnalista && (
          <select value={analista} onChange={(e) => setAnalista(e.target.value)} className="input-aura" style={{ fontSize: 13 }}>
            <option value="">Toda a carteira</option>
            {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label="Obrigações vencidas" value={r.obrigacoesVencidas ?? 0} cor={COLORS.erro} />
        <Kpi label="Vencem em 7 dias" value={r.obrigacoesProximas ?? 0} cor={COLORS.atencao} />
        <Kpi label="Notas com erro" value={r.notasComErro ?? 0} cor={COLORS.atencao} />
        <Kpi label="Sem docs no mês" value={r.clientesSemDoc ?? 0} cor={COLORS.erro} sub="clientes a cobrar" />
        <Kpi label="Clientes" value={r.clientes ?? 0} />
      </div>

      {/* COBRANÇAS DO GERENTE — atividades pedidas a você */}
      {cobrancas.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.strong, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={16} color={COLORS.acao} /> Cobranças do gerente <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.faint }}>({cobrancas.length})</span>
          </h2>
          {cobrancas.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: tint(COLORS.acao, 6), border: `1px solid ${tint(COLORS.acao, 22)}`, borderRadius: 10, padding: '11px 14px', marginBottom: 8 }}>
              <button onClick={() => concluir(c.id)} title="Concluir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.faint, display: 'flex' }}><Circle size={18} /></button>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.strong }}>{c.titulo}</div>
                {(c.cliente || c.criadoPor) && <div style={{ fontSize: 12, color: COLORS.muted }}>{c.cliente ? c.cliente : ''}{c.criadoPor ? ` · de ${c.criadoPor}` : ''}</div>}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.acao, textTransform: 'uppercase' }}>{c.prioridade}</span>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.strong, marginTop: 26, marginBottom: 12 }}>A fazer</h2>
      {(!data?.aFazer || data.aFazer.length === 0) && (
        <div style={{ padding: 26, textAlign: 'center', color: COLORS.ok, border: `1px dashed ${tint(COLORS.dotOk, 45)}`, background: tint(COLORS.dotOk, 5), borderRadius: 12, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', fontSize: 14 }}>
          <CheckCircle2 size={18} /> Tudo em dia! Nenhuma pendência.
        </div>
      )}
      {data?.aFazer?.map((t: any, i: number) => {
        const destino = t.companyId
          ? (t.tipo === 'inconsistencia' ? `/cliente-erros?companyId=${t.companyId}` : t.tipo === 'sem_documento' ? `/organizacao?companyId=${t.companyId}` : t.tipo === 'obrigacao' ? `/cliente-360?companyId=${t.companyId}` : null)
          : null;
        const clicavel = !!destino;
        const inner = (
          <div
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = cor(t.prioridade))}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderLeft: `3px solid ${dot(t.prioridade)}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, boxShadow: 'var(--shadow-card)', cursor: clicavel ? 'pointer' : 'default', transition: 'border-color .15s' }}>
            <span style={{ color: cor(t.prioridade) }}>{ico(t.tipo)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: COLORS.strong }}>{t.titulo}</div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>{t.cliente}</div>
            </div>
            {t.data && <span className="num" style={{ fontSize: 12, fontWeight: 600, color: cor(t.prioridade) }}>{dataBR(t.data)}</span>}
            {clicavel && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, color: COLORS.acao, whiteSpace: 'nowrap' }}>{t.tipo === 'inconsistencia' ? 'como corrigir' : 'abrir'} <ChevronRight size={14} /></span>}
          </div>
        );
        return clicavel
          ? <Link key={i} href={destino!} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link>
          : <div key={i}>{inner}</div>;
      })}
    </div>
  );
}
