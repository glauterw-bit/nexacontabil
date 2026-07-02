'use client';
import { useEffect, useState, useMemo } from 'react';
import { LayoutGrid, Loader2, RefreshCw, Search, Building2, AlertTriangle, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const REG: Record<string, string> = { SIMPLES_NACIONAL: 'SN', LUCRO_PRESUMIDO: 'LP', LUCRO_REAL: 'LR', MEI: 'MEI' };

export default function VisaoGeralPage() {
  const router = useRouter();
  const { setSelectedCompany } = useCompany();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'pendencias' | 'faturamento' | 'docs'>('pendencias');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/gestao-admin/clientes`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const clientes = useMemo(() => {
    let cs = data?.clientes ?? [];
    if (busca) { const b = busca.toLowerCase(); cs = cs.filter((c: any) => c.nome.toLowerCase().includes(b) || String(c.codigo ?? '').includes(b)); }
    return [...cs].sort((a: any, b: any) => ordem === 'faturamento' ? b.faturamento - a.faturamento : ordem === 'docs' ? b.docs - a.docs : (b.pendencias - a.pendencias || b.faturamento - a.faturamento));
  }, [data, busca, ordem]);

  function abrir(c: any) {
    setSelectedCompany({ id: c.id, name: c.nome, cnpj: c.cnpj ?? '', taxRegime: c.regime } as any);
    router.push('/dashboard');
  }

  return (
    <div className="p-5 md:p-8 max-w-[1400px] space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <LayoutGrid className="h-5 w-5 text-acao" />
            <h1 className="text-xl font-semibold text-tx-strong">Visão Geral — Todos os Clientes</h1>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-acao border border-indigo-500/30 rounded">Admin</span>
          </div>
          <p className="text-sm text-tx-muted">Panorama de toda a carteira · clique num cliente pra abrir o painel dele</p>
        </div>
        <button onClick={load} className="p-2 bg-card border border-line rounded-lg text-tx-muted hover:text-tx-strong"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {loading ? (
        <div className="text-center py-24 text-sm text-tx-muted flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando carteira…</div>
      ) : data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clientes ativos" value={data.totals.clientes} icon={Building2} />
            <Kpi label="Faturamento total" value={BRL(data.totals.faturamentoTotal)} icon={TrendingUp} color="var(--ok)" />
            <Kpi label="Documentos" value={data.totals.docsTotal.toLocaleString('pt-BR')} icon={FileText} color="var(--acao)" />
            <Kpi label="Com pendência" value={data.totals.comPendencia} icon={AlertTriangle} color={data.totals.comPendencia ? 'var(--erro)' : 'var(--ok)'} />
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou código…"
                className="w-full bg-card border border-line rounded-lg pl-10 pr-4 py-2.5 text-tx text-sm outline-none focus:border-indigo-500 placeholder:text-tx-faint" />
            </div>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="bg-card border border-line rounded-lg px-3 py-2.5 text-tx text-sm outline-none focus:border-indigo-500">
              <option value="pendencias">Ordenar: pendências</option>
              <option value="faturamento">Ordenar: faturamento</option>
              <option value="docs">Ordenar: documentos</option>
            </select>
          </div>

          {/* Tabela */}
          <div className="rounded-xl border border-line bg-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-tx-muted border-b border-line">
                  <th className="px-4 py-3 font-medium">Cód.</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Regime</th>
                  <th className="px-4 py-3 font-medium">Segmento</th>
                  <th className="px-4 py-3 font-medium text-right">Faturamento</th>
                  <th className="px-4 py-3 font-medium text-right">Docs</th>
                  <th className="px-4 py-3 font-medium text-center">Cronograma</th>
                  <th className="px-4 py-3 font-medium text-center">Pendências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clientes.slice(0, 400).map((c: any) => (
                  <tr key={c.id} onClick={() => abrir(c)} className="hover:bg-inset cursor-pointer">
                    <td className="px-4 py-2.5 text-tx-muted font-mono">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-tx-strong">{c.nome}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-acao">{REG[c.regime] ?? c.regime}</span></td>
                    <td className="px-4 py-2.5 text-tx-muted text-xs capitalize">{c.segmento ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ok">{c.faturamento ? BRL(c.faturamento) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-tx-muted">{c.docs}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-12 h-1.5 bg-inset rounded-full inline-block overflow-hidden">
                          <span className="h-full block rounded-full" style={{ width: `${c.cronograma}%`, background: c.cronograma >= 80 ? 'var(--dot-ok)' : c.cronograma >= 40 ? 'var(--dot-atencao)' : 'var(--dot-erro)' }} />
                        </span>
                        <span className="text-[10px] text-tx-muted">{c.cronograma}%</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.pendencias > 0 ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/15 text-err">{c.pendencias}</span> : <span className="text-ok text-xs">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-tx-faint text-center">Mostrando {Math.min(clientes.length, 400)} de {clientes.length} clientes</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color = 'var(--tx-strong)' }: any) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-tx-muted">{label}</span><Icon className="h-3.5 w-3.5" style={{ color }} /></div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
