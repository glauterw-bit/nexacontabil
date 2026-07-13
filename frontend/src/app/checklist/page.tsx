'use client';
import { useEffect, useState, useCallback } from 'react';
import { ListChecks, Search, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, Spinner, EmptyState, Kpi } from '@/components/ui/kit';
import { useCompetencia } from '@/contexts/CompetenciaContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const DEPS = [
  { k: 'fiscal', label: 'Fiscal' },
  { k: 'contabil', label: 'Contábil' },
  { k: 'folha', label: 'Folha' },
];

export default function ChecklistPage() {
  const { competencia } = useCompetencia();
  const [clientes, setClientes] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [dep, setDep] = useState('fiscal');
  const [ck, setCk] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/clientes-atribuicao`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : []).then((d) => setClientes(Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/v1/checklist/overview${competencia ? `?competencia=${competencia}` : ''}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setOverview).catch(() => {});
  }, [competencia]);

  const carregar = useCallback(async (companyId: string, departamento: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`${API}/api/v1/checklist/cliente?companyId=${companyId}&departamento=${departamento}${competencia ? `&competencia=${competencia}` : ''}`, { headers: authHeaders() });
      if (r.ok) setCk(await r.json());
    } catch {} finally { setCarregando(false); }
  }, [competencia]);

  function escolher(c: any) { setSel(c); carregar(c.id, dep); }
  function trocarDep(d: string) { setDep(d); if (sel) carregar(sel.id, d); }

  async function toggle(itemKey: string, feito: boolean) {
    if (!sel) return;
    setMarcando(itemKey);
    try {
      const r = await fetch(`${API}/api/v1/checklist/marcar`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ companyId: sel.id, departamento: dep, itemKey, feito, competencia }),
      });
      if (r.ok) setCk(await r.json());
    } catch {} finally { setMarcando(null); }
  }

  const lista = clientes.filter((c) => !busca || (c.name || '').toLowerCase().includes(busca.toLowerCase())).slice(0, 60);

  return (
    <div className="page">
      <PageHeader icon={<ListChecks size={22} color={COLORS.acao} />} title="Checklists de Fechamento"
        subtitle="Fiscal, Contábil e Folha — por cliente e competência. Só conta como pronto o que está marcado." />

      {overview && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {DEPS.map((d) => (
            <Kpi key={d.k} label={`${d.label} completos`} value={`${overview.resumo?.[d.k]?.completos ?? 0}/${overview.clientes ?? 0}`}
              cor={COLORS.ok} sub="clientes com checklist 100%" />
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* seletor de cliente */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 10, borderBottom: `1px solid ${COLORS.border}` }}>
            <Search size={14} style={{ position: 'absolute', left: 20, top: 19, color: COLORS.faint }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="input-aura" style={{ width: '100%', padding: '7px 10px 7px 28px', fontSize: 13 }} />
          </div>
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {lista.map((c) => (
              <button key={c.id} onClick={() => escolher(c)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: `1px solid ${COLORS.borderSoft}`, background: sel?.id === c.id ? tint(COLORS.acao, 10) : 'transparent', cursor: 'pointer', color: sel?.id === c.id ? COLORS.strong : COLORS.text, fontSize: 13, fontWeight: sel?.id === c.id ? 600 : 400 }}>
                {c.name}
              </button>
            ))}
          </div>
        </Card>

        {/* checklist */}
        <div>
          {!sel && <EmptyState icon={<ListChecks size={30} />} title="Escolha um cliente" sub="para ver e marcar o checklist do mês." />}
          {sel && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {DEPS.map((d) => (
                  <button key={d.k} onClick={() => trocarDep(d.k)} className={dep === d.k ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 13 }}>{d.label}</button>
                ))}
                {ck && <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 13, color: COLORS.muted }}>{ck.feitos}/{ck.total} · <b style={{ color: ck.pct === 100 ? COLORS.ok : COLORS.strong }}>{ck.pct}%</b></span>}
              </div>

              {carregando && <Spinner pad={30} />}
              {!carregando && ck && (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {ck.itens.map((it: any, i: number) => (
                    <button key={it.key} onClick={() => toggle(it.key, !it.feito)} disabled={marcando === it.key}
                      style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 12, padding: '13px 16px', border: 'none', borderBottom: i < ck.itens.length - 1 ? `1px solid ${COLORS.borderSoft}` : 'none', background: 'transparent', cursor: 'pointer' }}>
                      {marcando === it.key ? <Loader2 size={18} className="animate-spin" style={{ color: COLORS.acao, flexShrink: 0 }} />
                        : it.feito ? <CheckCircle2 size={18} color={COLORS.ok} style={{ flexShrink: 0 }} />
                        : <Circle size={18} color={COLORS.faint} style={{ flexShrink: 0 }} />}
                      <span style={{ fontSize: 13.5, color: it.feito ? COLORS.faint : COLORS.strong, textDecoration: it.feito ? 'line-through' : 'none' }}>{it.label}</span>
                      {it.feito && it.feitoEm && <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.faint }}>{new Date(it.feitoEm).toLocaleDateString('pt-BR')}</span>}
                    </button>
                  ))}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
