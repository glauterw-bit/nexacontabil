'use client';
import { useEffect, useState, useCallback } from 'react';
import { Calculator, AlertTriangle, Search } from 'lucide-react';
import { PageHeader, Kpi, Card, SectionTitle, COLORS, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ApuracaoPage() {
  const [ov, setOv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [det, setDet] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/organizacao/overview`, { headers: authHeaders() }) // reusa lista de clientes
      .then((r) => r.ok ? r.json() : null).then((d) => d && setCompanies(d.topClientes ?? [])).catch(() => {});
    fetch(`${API}/api/v1/apuracao/overview`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setOv).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const abrir = useCallback(async (c: any) => {
    setSel(c); setDet(null);
    const r = await fetch(`${API}/api/v1/apuracao/cliente/${c.companyId}`, { headers: authHeaders() });
    if (r.ok) setDet(await r.json());
  }, []);

  if (loading) return <Spinner />;
  const filtrados = companies.filter((c) => (c.nome || '').toLowerCase().includes(busca.toLowerCase())).slice(0, 40);

  return (
    <div className="page">
      <PageHeader icon={<Calculator size={22} color={COLORS.acao} />} title="Apuração de Impostos"
        subtitle="Impostos a recolher por cliente e competência, calculados dos documentos reais." />

      {ov && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Kpi label="Receita (saídas)" value={BRL(ov.receitaTotal)} />
            <Kpi label="ICMS destacado" value={BRL(ov.icmsTotal)} />
            <Kpi label="PIS+COFINS" value={BRL(ov.pisCofinsTotal)} />
          </div>
          <SectionTitle>Por regime</SectionTitle>
          <Card>
            <div style={{ display: 'flex', fontSize: 11, fontWeight: 600, color: COLORS.faint, padding: '0 4px 6px', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ flex: 1 }}>Regime</div><div style={{ width: 130, textAlign: 'right' }}>Receita</div><div style={{ width: 120, textAlign: 'right' }}>ICMS</div><div style={{ width: 120, textAlign: 'right' }}>PIS+COFINS</div><div style={{ width: 70, textAlign: 'right' }}>Notas</div>
            </div>
            {ov.porRegime.map((r: any) => (
              <div key={r.regime} style={{ display: 'flex', fontSize: 13, padding: '6px 4px', borderTop: '1px solid var(--border-soft)' }}>
                <div style={{ flex: 1, fontWeight: 600 }}>{r.regime}</div>
                <div className="num" style={{ width: 130, textAlign: 'right' }}>{BRL(r.receita)}</div>
                <div className="num" style={{ width: 120, textAlign: 'right' }}>{BRL(r.icms)}</div>
                <div className="num" style={{ width: 120, textAlign: 'right' }}>{BRL(r.pisCofins)}</div>
                <div className="num" style={{ width: 70, textAlign: 'right', color: COLORS.muted }}>{r.notas}</div>
              </div>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Apuração por cliente</SectionTitle>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: COLORS.faint }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
              className="input-aura" style={{ width: '100%', paddingLeft: 36 }} />
          </div>
          {filtrados.map((c) => (
            <Card key={c.companyId} style={{ marginBottom: 6, padding: '10px 12px', cursor: 'pointer', borderColor: sel?.companyId === c.companyId ? COLORS.acao : COLORS.border }}>
              <div onClick={() => abrir(c)}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{c.regime} · {c.qtd} docs</div>
              </div>
            </Card>
          ))}
        </div>

        <div style={{ flex: '2 1 560px' }}>
          {!sel ? <Card><EmptyState icon={<Calculator size={28} />} title="Selecione um cliente para ver a apuração mês a mês." /></Card> :
            !det ? <Spinner pad={30} /> :
            det.erro ? <Card style={{ color: COLORS.erro }}>{det.erro}</Card> : (
              <>
                <Card style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700 }}>{det.empresa.nome}</div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>{det.empresa.regime}{det.dasEfetiva ? ` · DAS efetivo ${det.dasEfetiva}%` : ''} · RBT12 {BRL(det.rbt12)}</div>
                  <div className="num" style={{ fontSize: 20, fontWeight: 700, color: COLORS.strong, marginTop: 6 }}>{BRL(det.totalApurado)} <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 400 }}>apurado em {det.competencias} competências</span></div>
                  {det.semEntradas && <div style={{ display: 'flex', gap: 6, marginTop: 8, fontSize: 12, color: COLORS.atencao }}><AlertTriangle size={14} /> Apuração de ICMS parcial — faltam notas de entrada p/ crédito.</div>}
                </Card>
                {det.apuracoes.slice().reverse().map((a: any) => (
                  <Card key={a.competencia} style={{ marginBottom: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong>{a.competencia}</strong>
                      <div><span style={{ fontSize: 12, color: COLORS.muted }}>receita {BRL(a.receita)} · </span><strong className="num" style={{ color: COLORS.strong }}>{BRL(a.total)}</strong></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {a.tributos.filter((t: any) => t.valor > 0).map((t: any, i: number) => (
                        <span key={i} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}` }}>
                          {t.nome}: <strong>{BRL(t.valor)}</strong>{t.estimado ? ' *' : ''}
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
                <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 4 }}>* IRPJ/CSLL estimados pela presunção do regime.</div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
