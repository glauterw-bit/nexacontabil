'use client';
import { useEffect, useState } from 'react';
import { ClipboardCheck, FileX, ArrowDownCircle, AlertTriangle, Building2, IdCard, Copy, Check } from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, COLORS, tint, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const PRIO: Record<string, string> = { alta: COLORS.erro, media: COLORS.atencao, baixa: COLORS.faint };
const ICO: Record<string, any> = { documentos: FileX, entradas: ArrowDownCircle, correcao: AlertTriangle, regime: Building2, cadastro: IdCard };

export default function SolicitacoesPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/solicitacoes/overview`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function copiarMsg(companyId: string, nome: string) {
    const r = await fetch(`${API}/api/v1/solicitacoes/mensagem/${companyId}`, { headers: authHeaders() });
    if (!r.ok) return;
    const { texto } = await r.json();
    try { await navigator.clipboard.writeText(texto); setCopiado(companyId); setTimeout(() => setCopiado(null), 2000); }
    catch { alert(texto); }
  }

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<ClipboardCheck size={32} />} title="Sem dados." />;

  const FILTROS = [
    { k: '', label: 'Todos' },
    { k: 'documentos', label: `Sem documentos (${d.resumo.semDocumentos})` },
    { k: 'entradas', label: `Sem entradas (${d.resumo.semEntradas})` },
    { k: 'correcao', label: `Com inconsistência (${d.resumo.comInconsistencia})` },
    { k: 'regime', label: `Sem regime (${d.resumo.semRegime})` },
    { k: 'cadastro', label: `CNPJ provisório (${d.resumo.cnpjProvisorio})` },
  ];
  const lista = (d.clientes ?? []).filter((c: any) => !filtro || c.pendencias.some((p: any) => p.tipo === filtro));

  return (
    <div className="page-narrow">
      <PageHeader icon={<ClipboardCheck size={22} color={COLORS.acao} />} title="Solicitar aos Clientes"
        subtitle="O que falta em cada cliente — pra o analista pedir e completar a contabilidade." />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Kpi label="Clientes ativos" value={d.totalAtivos} />
        <Kpi label="Com pendência" value={d.comPendencia} cor={COLORS.atencao} />
        <Kpi label="Sem nenhum documento" value={d.resumo.semDocumentos} cor={COLORS.erro} />
        <Kpi label="Sem notas de entrada" value={d.resumo.semEntradas} cor={COLORS.atencao} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        {FILTROS.map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)}
            style={{ padding: '6px 12px', borderRadius: 20, border: `1px solid ${filtro === f.k ? COLORS.acao : COLORS.border}`, background: filtro === f.k ? tint(COLORS.acao, 13) : COLORS.surface2, color: filtro === f.k ? COLORS.acao : COLORS.muted, fontSize: 12, cursor: 'pointer' }}>
            {f.label}
          </button>
        ))}
      </div>

      <SectionTitle>{lista.length} clientes a solicitar</SectionTitle>
      {lista.map((c: any) => (
        <Card key={c.companyId} style={{ marginBottom: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nome}</div>
              <div style={{ fontSize: 11, color: COLORS.muted }}>{c.regime} · {c.docs} docs analisados</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {c.pendencias.map((p: any, i: number) => {
                  const Icon = ICO[p.tipo] ?? AlertTriangle;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 13, color: 'var(--tx)' }}>
                      <Icon size={14} color={PRIO[p.prioridade]} style={{ marginTop: 2, flexShrink: 0 }} /> {p.texto}
                    </div>
                  );
                })}
              </div>
            </div>
            <button onClick={() => copiarMsg(c.companyId, c.nome)} className="btn-secondary"
              style={{ whiteSpace: 'nowrap', color: copiado === c.companyId ? COLORS.ok : undefined }}>
              {copiado === c.companyId ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Mensagem</>}
            </button>
          </div>
        </Card>
      ))}
      {lista.length === 0 && <Card><EmptyState icon={<Check size={28} />} title="Nenhuma pendência nesse filtro. ✅" /></Card>}
    </div>
  );
}
