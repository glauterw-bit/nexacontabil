'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Coins, TrendingUp, RefreshCw, Search, ChevronRight, Scale, Info } from 'lucide-react';
import { PageHeader, Card, Kpi, COLORS, tint, Spinner, EmptyState, THead } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: any) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const REG: Record<string, string> = { SIMPLES_NACIONAL: 'Simples', LUCRO_PRESUMIDO: 'Presumido', LUCRO_REAL: 'Real', MEI: 'MEI' };

export default function MonofasicoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/monofasico`, { headers: authHeaders() });
      if (r.ok) setD(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<Coins size={32} />} title="Sem dados" sub="Verifique a conexão." />;

  const lista = (d.clientes ?? []).filter((c: any) => !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()));
  const potencialTotal = (d.totalRecuperavelReais ?? 0) + (d.totalEconomiaSimplesAno ?? 0);

  return (
    <div className="page">
      <PageHeader icon={<Coins size={22} color={COLORS.acao} />} title="Oportunidade Monofásica"
        subtitle="Recuperação de PIS/COFINS na revenda de produtos monofásicos — base legal (Lei 10.485/2002, 10.147/2000)."
        action={<button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>} />

      {/* explicação */}
      <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 10, fontSize: 12.5, background: tint(COLORS.acao, 7), border: `1px solid ${tint(COLORS.acao, 20)}`, color: COLORS.muted, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Scale size={15} style={{ flexShrink: 0, marginTop: 1, color: COLORS.acao }} />
        <span>Na revenda de produto monofásico o PIS/COFINS é <b>0% por lei</b> (foi recolhido na indústria). Quem recolheu na revenda pode <b>recuperar os últimos 5 anos</b>; no Simples, <b>segregar no PGDAS</b> reduz o DAS todo mês. Os valores de <b>"recuperável"</b> saem das notas reais; os de Simples são <b>estimativa</b> a confirmar por faixa.</span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Kpi label="Potencial total" value={BRL(potencialTotal)} cor={COLORS.ok} sub="recuperável + economia/ano" />
        <Kpi label="Recuperável (não-Simples)" value={BRL(d.totalRecuperavelReais)} cor={COLORS.acao} sub="PIS/COFINS pago na revenda" />
        <Kpi label="Economia Simples/ano (est.)" value={BRL(d.totalEconomiaSimplesAno)} cor={COLORS.atencao} sub="segregando no PGDAS" />
        <Kpi label="Receita monofásica" value={BRL(d.totalValorMono)} sub={`${d.totalClientes ?? 0} clientes`} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.strong, margin: 0 }}>
          Por cliente <span style={{ fontWeight: 400, color: COLORS.faint, fontSize: 13, marginLeft: 6 }}>ordenado por potencial</span>
        </h2>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: COLORS.faint }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="input-aura" style={{ padding: '7px 10px 7px 30px', fontSize: 13 }} />
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <THead cols={[
          { label: 'Cliente' },
          { label: 'Regime', width: 90 },
          { label: 'Receita mono.', width: 120, align: 'right' },
          { label: 'Potencial', width: 130, align: 'right' },
          { label: '', width: 24 },
        ]} />
        {lista.length === 0 && <EmptyState icon={<Search size={26} />} title="Nenhum cliente com produto monofásico encontrado." sub="Rode a revalidação após capturar os XMLs." />}
        {lista.slice(0, 200).map((c: any) => {
          const pot = (c.recuperavelReais ?? 0) + (c.economiaSimplesAnoEstimada ?? 0);
          const simples = c.regime === 'SIMPLES_NACIONAL';
          return (
            <div key={c.companyId} onClick={() => setSel(sel?.companyId === c.companyId ? null : c)}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', fontSize: 13, transition: 'background .1s' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                <div style={{ fontSize: 11, color: COLORS.faint }}>{(c.grupos ?? []).join(' · ')}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
              </div>
              <div style={{ width: 90, fontSize: 12, color: simples ? COLORS.atencao : COLORS.muted }}>{REG[c.regime] ?? c.regime ?? '—'}</div>
              <div className="num" style={{ width: 120, textAlign: 'right' }}>{BRL(c.valorMono)}</div>
              <div className="num" style={{ width: 130, textAlign: 'right', fontWeight: 700, color: pot > 0 ? COLORS.ok : COLORS.faint }}>{pot > 0 ? BRL(pot) : '—'}</div>
              <ChevronRight size={14} color={COLORS.faint} style={{ width: 24, flexShrink: 0, transform: sel?.companyId === c.companyId ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            </div>
          );
        })}
      </Card>

      {sel && (
        <Card style={{ marginTop: 14 }} accent={COLORS.acao}>
          <div style={{ fontWeight: 700, color: COLORS.strong, marginBottom: 8 }}>{sel.nome}</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 10 }}>
            <Mini label="Receita monofásica" v={BRL(sel.valorMono)} sub={`${sel.notasMono} notas`} />
            {sel.regime === 'SIMPLES_NACIONAL'
              ? <Mini label="Economia/ano (est.)" v={BRL(sel.economiaSimplesAnoEstimada)} sub="segregando no PGDAS" cor={COLORS.atencao} />
              : <Mini label="Recuperável" v={BRL(sel.recuperavelReais)} sub={`${sel.notasIndevidas} notas c/ PIS/COFINS indevido`} cor={COLORS.ok} />}
          </div>
          <div style={{ fontSize: 13, color: COLORS.muted, padding: '10px 12px', background: tint(COLORS.dotOk, 7), borderRadius: 9, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <TrendingUp size={15} color={COLORS.ok} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><b>Ação recomendada:</b> {sel.acao}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <Link href={`/cliente-erros?companyId=${sel.companyId}`} className="btn-secondary" style={{ fontSize: 12.5 }}>Ver notas do cliente <ChevronRight size={13} /></Link>
          </div>
        </Card>
      )}

      <p style={{ fontSize: 11, color: COLORS.faint, marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Info size={12} /> Valores "recuperável" vêm das notas reais capturadas. Confirme o regime e a segregação atual de cada cliente antes de protocolar — a estimativa do Simples usa a faixa média do Anexo I.
      </p>
    </div>
  );
}

function Mini({ label, v, sub, cor }: { label: string; v: string; sub?: string; cor?: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 20, fontWeight: 800, color: cor ?? COLORS.strong }}>{v}</div>
      <div style={{ fontSize: 11, color: COLORS.faint }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}
