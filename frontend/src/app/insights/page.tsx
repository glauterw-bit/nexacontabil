'use client';
import { useEffect, useState, useCallback } from 'react';
import { Brain, Loader2, Sparkles, TrendingUp, AlertTriangle, Lightbulb, X, Play } from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const scoreCor = (s: number) => s >= 85 ? COLORS.ok : s >= 70 ? COLORS.atencao : COLORS.erro;

export default function InsightsPage() {
  const [data, setData] = useState<any>(null);
  const [prog, setProg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        fetch(`${API}/api/v1/insights/overview`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/insights/progresso`, { headers: authHeaders() }),
      ]);
      if (o.ok) setData(await o.json());
      if (p.ok) setProg(await p.json());
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function rodarLote() {
    setRodando(true);
    try {
      await fetch(`${API}/api/v1/insights/lote`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ limit: 40 }) });
      await load();
    } finally { setRodando(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}><Loader2 size={32} className="animate-spin" /></div>;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<Brain size={24} color={COLORS.acao} />} title="Insights de IA" subtitle="Análise fiscal e contábil avançada sobre os dados reais da carteira."
        action={<button onClick={rodarLote} disabled={rodando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: COLORS.acao, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {rodando ? <Loader2 size={16} className="animate-spin" /> : <Play size={15} />} Gerar insights (lote de 40)
        </button>} />

      {prog && (
        <div style={{ marginBottom: 16, fontSize: 13, color: COLORS.muted }}>
          {prog.comInsight} de {prog.clientesComDocs} clientes analisados{prog.restantes > 0 ? ` · ${prog.restantes} restantes` : ' · completo'}
        </div>
      )}

      {(!data || data.total === 0) ? (
        <Card style={{ textAlign: 'center', padding: 30, color: COLORS.faint }}>
          Nenhum insight gerado ainda. Clique em <strong>Gerar insights</strong> para a IA analisar a carteira.
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Kpi label="Clientes analisados" value={data.total} />
            <Kpi label="Carga tributária média" value={`${data.cargaTributariaMedia}%`} cor={COLORS.atencao} />
            <Kpi label="Score médio de saúde" value={data.scoreMedia} cor={scoreCor(data.scoreMedia)} />
            <Kpi label="Em atenção (score<70)" value={data.atencao?.length ?? 0} cor={COLORS.erro} />
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ flex: '1 1 460px' }}>
              <SectionTitle>Clientes que precisam de atenção</SectionTitle>
              {(data.atencao ?? []).map((c: any) => (
                <Card key={c.companyId} accent={scoreCor(c.score)} style={{ marginBottom: 8, padding: '12px 14px', cursor: 'pointer' }}>
                  <div onClick={() => setAberto(c.companyId)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{c.regime} · carga {c.cargaTributaria?.toFixed(1)}% · {c.oportunidades} oport. · {c.riscos} riscos</div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: scoreCor(c.score) }}>{c.score}</div>
                  </div>
                </Card>
              ))}
            </div>
            <div style={{ flex: '1 1 460px' }}>
              <SectionTitle>Maior carga tributária</SectionTitle>
              {(data.maiorCarga ?? []).map((c: any, i: number) => (
                <Card key={c.companyId} style={{ marginBottom: 8, padding: '12px 14px', cursor: 'pointer' }}>
                  <div onClick={() => setAberto(c.companyId)} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 20, color: COLORS.faint, fontWeight: 700 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{c.regime} · {BRL(c.faturamento)}</div>
                    </div>
                    <div style={{ color: COLORS.atencao, fontWeight: 700 }}>{c.cargaTributaria?.toFixed(1)}%</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      {aberto && <InsightDrawer companyId={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

function InsightDrawer({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/v1/insights/${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);
  const p = d?.payload ?? {};

  const Lista = ({ titulo, itens, cor, icon }: any) => (itens?.length ? (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: cor, fontSize: 13 }}>{icon} {titulo}</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
        {itens.map((s: string, i: number) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  ) : null);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#0009', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '96vw', height: '100%', background: '#0f1420', borderLeft: `1px solid ${COLORS.border}`, overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: COLORS.acao }}><Sparkles size={18} /> Insight de IA</div>
          <X size={18} style={{ cursor: 'pointer', color: COLORS.faint }} onClick={onClose} />
        </div>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="animate-spin" /></div> :
          !d ? <div style={{ color: COLORS.faint }}>Sem insight gerado para este cliente.</div> : (
            <>
              {d.scoreSaude != null && <div style={{ fontSize: 34, fontWeight: 800, color: scoreCor(d.scoreSaude) }}>{d.scoreSaude}<span style={{ fontSize: 14, color: COLORS.muted, fontWeight: 400 }}> / 100 saúde</span></div>}
              <p style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>{p.resumoExecutivo}</p>
              <Card style={{ marginTop: 8, padding: 12, background: '#13182a' }}>
                <div style={{ fontSize: 12, color: COLORS.faint }}>Economia potencial</div>
                <div style={{ fontSize: 13, color: COLORS.ok, marginTop: 2 }}>{p.economiaPotencial}</div>
              </Card>
              <SectionTitle>Fiscal</SectionTitle>
              <Lista titulo="Observações" itens={p.fiscal?.observacoes} cor={COLORS.info} icon={<TrendingUp size={14} />} />
              <Lista titulo="Oportunidades" itens={p.fiscal?.oportunidades} cor={COLORS.ok} icon={<Lightbulb size={14} />} />
              <Lista titulo="Riscos" itens={p.fiscal?.riscos} cor={COLORS.erro} icon={<AlertTriangle size={14} />} />
              <SectionTitle>Contábil</SectionTitle>
              <Lista titulo="Observações" itens={p.contabil?.observacoes} cor={COLORS.info} icon={<TrendingUp size={14} />} />
              <Lista titulo="Recomendações" itens={p.contabil?.recomendacoes} cor={COLORS.acao} icon={<Lightbulb size={14} />} />
            </>
          )}
      </div>
    </div>
  );
}
