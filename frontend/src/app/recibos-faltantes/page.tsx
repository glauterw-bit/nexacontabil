'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Search, Download } from 'lucide-react';
import { PageHeader, Card, COLORS, Kpi, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type Mes = { mes: number; status: 'ok' | 'faltante' | 'futuro' | 'na' };
type Cliente = { companyId: string; cliente: string; codigo?: string; regime?: string; responsavel?: string; tipo: string; faltam: number; entregues: number; meses: Mes[]; mesesFaltantes: number[] };
type Dados = { ano: number; mesLimite: number; resumo: { clientes: number; clientesComFalta: number; recibosFaltantes: number; recibosEntregues: number }; clientes: Cliente[] };

const CELL: Record<Mes['status'], { bg: string; fg: string; label: string }> = {
  ok: { bg: COLORS.ok, fg: '#fff', label: '✓' },
  faltante: { bg: COLORS.erro, fg: '#fff', label: '!' },
  futuro: { bg: '#E8EAED', fg: '#9AA0A6', label: '·' },
  na: { bg: 'transparent', fg: '#C4C7CC', label: '–' },
};

export default function RecibosFaltantesPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [busca, setBusca] = useState('');
  const [soFalta, setSoFalta] = useState(true);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/paineis/recibos-faltantes?ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setDados).catch(() => setDados(null)).finally(() => setLoading(false));
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const clientes = useMemo(() => {
    let lista = dados?.clientes ?? [];
    if (soFalta) lista = lista.filter((c) => c.faltam > 0);
    if (busca.trim()) { const q = busca.toLowerCase(); lista = lista.filter((c) => c.cliente.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)); }
    return lista;
  }, [dados, soFalta, busca]);

  const exportarCsv = () => {
    if (!dados) return;
    const head = ['Codigo', 'Cliente', 'Regime', 'Obrigacao', 'Responsavel', 'Faltam', 'Meses faltantes'];
    const linhas = (dados.clientes ?? []).filter((c) => c.faltam > 0).map((c) => [c.codigo ?? '', c.cliente, c.regime ?? '', c.tipo, c.responsavel ?? '', String(c.faltam), c.mesesFaltantes.map((m) => MESES[m - 1]).join(' ')]);
    const csv = [head, ...linhas].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `recibos-faltantes-${ano}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const r = dados?.resumo;
  return (
    <div style={{ padding: '20px 24px 60px', maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        icon={<AlertTriangle size={22} />}
        title="Recibos faltantes"
        subtitle="Quem não subiu o recibo da obrigação principal (DAS / DCTFWeb) em cada mês — para a equipe cobrar."
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14 }}>
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={exportarCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: COLORS.strong, color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              <Download size={15} /> Exportar
            </button>
          </div>
        }
      />

      {loading ? <Spinner /> : !dados ? <EmptyState icon={<AlertTriangle />} title="Não foi possível carregar" sub="Tente recarregar a página." /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="Recibos faltantes" value={(r?.recibosFaltantes ?? 0).toLocaleString('pt-BR')} cor={(r?.recibosFaltantes ?? 0) ? COLORS.erro : COLORS.ok} sub={`${r?.clientesComFalta ?? 0} clientes com pendência`} />
            <Kpi label="Recibos entregues" value={(r?.recibosEntregues ?? 0).toLocaleString('pt-BR')} cor={COLORS.ok} sub={`ano ${dados.ano}`} />
            <Kpi label="Clientes na carteira" value={(r?.clientes ?? 0).toLocaleString('pt-BR')} cor={COLORS.strong} />
          </div>

          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 260px' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#9AA0A6' }} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou código…"
                  style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.strong, cursor: 'pointer' }}>
                <input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} /> só com pendência
              </label>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6B7076', marginLeft: 'auto' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.ok, display: 'inline-block' }} /> entregue</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: COLORS.erro, display: 'inline-block' }} /> faltante</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: '#E8EAED', display: 'inline-block' }} /> a vencer</span>
              </div>
            </div>

            {clientes.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title={soFalta ? 'Nenhuma pendência 🎉' : 'Sem clientes'} sub={soFalta ? 'Todos os recibos do período estão nas pastas.' : undefined} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#6B7076', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px', position: 'sticky', left: 0, background: '#fff', minWidth: 220 }}>Cliente</th>
                      <th style={{ padding: '6px 8px' }}>Obrig.</th>
                      {MESES.map((m) => <th key={m} style={{ padding: '6px 4px', textAlign: 'center', width: 30 }}>{m}</th>)}
                      <th style={{ padding: '6px 8px', textAlign: 'center' }}>Faltam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr key={c.companyId} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: '7px 8px', position: 'sticky', left: 0, background: '#fff' }}>
                          <div style={{ fontWeight: 600, color: COLORS.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>
                            {c.codigo ? <span style={{ color: '#9AA0A6' }}>{c.codigo} · </span> : null}{c.cliente}
                          </div>
                          {c.responsavel ? <div style={{ fontSize: 11, color: '#9AA0A6' }}>{c.responsavel}</div> : null}
                        </td>
                        <td style={{ padding: '7px 8px', color: '#6B7076', whiteSpace: 'nowrap' }}>{c.tipo}</td>
                        {c.meses.map((m) => {
                          const s = CELL[m.status];
                          return <td key={m.mes} style={{ padding: 3, textAlign: 'center' }}>
                            <div title={`${MESES[m.mes - 1]}: ${m.status}`} style={{ width: 24, height: 24, borderRadius: 5, background: s.bg, color: s.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontWeight: 700, fontSize: 12 }}>{s.label}</div>
                          </td>;
                        })}
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: c.faltam ? COLORS.erro : COLORS.ok }}>{c.faltam || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p style={{ fontSize: 12, color: '#9AA0A6', marginTop: 12 }}>
            Baseado no calendário reconciliado com os comprovantes das pastas. FGTS/eSocial não entram (são cumpridos no portal, sem PDF). Meses a vencer não contam como falta.
          </p>
        </>
      )}
    </div>
  );
}
