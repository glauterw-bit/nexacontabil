'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  Briefcase, Loader2, RefreshCw, Search, Building2, FileText, AlertTriangle, FolderOpen,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const CORES: Record<string, string> = {
  'Simples Nacional': '#10b981', 'Lucro Presumido': '#6366f1', 'Lucro Real': '#f59e0b',
  'MEI': '#06b6d4', 'Não identificado': '#64748b',
};

export default function CarteiraPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [regimeFiltro, setRegimeFiltro] = useState('');
  const [prog, setProg] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/cloud/carteira`, { headers: authHeaders() });
      setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }
  async function loadProg() {
    try {
      const r = await fetch(`${API}/api/v1/analise-cliente/progresso`, { headers: authHeaders() });
      if (r.ok) setProg(await r.json());
    } catch { /* noop */ }
  }
  useEffect(() => { load(); loadProg(); }, []);
  useEffect(() => {
    const t = setInterval(loadProg, 10000); // atualiza a cada 10s
    return () => clearInterval(t);
  }, []);

  const clientes = useMemo(() => {
    let cs = data?.clientes ?? [];
    if (regimeFiltro) cs = cs.filter((c: any) => c.regime === regimeFiltro);
    if (busca) { const b = busca.toLowerCase(); cs = cs.filter((c: any) => c.nome.toLowerCase().includes(b) || String(c.codigo ?? '').includes(b)); }
    return cs;
  }, [data, busca, regimeFiltro]);

  return (
    <div className="p-5 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Briefcase className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Carteira de Clientes</h1>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded">SharePoint ao vivo</span>
          </div>
          <p className="text-sm text-gray-400">Análise da carteira lida direto do SharePoint do escritório · {data?.totalClientes ?? 0} clientes</p>
        </div>
        <button onClick={load} className="p-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-gray-400 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* Barra de progresso da análise */}
      {prog && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-sm text-white flex items-center gap-2">
              {prog.rodando ? <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> : <span className="text-emerald-400">✓</span>}
              Análise dos documentos · <b>{prog.analisados}/{prog.total}</b> clientes ({prog.pct}%)
            </span>
            <span className="text-xs text-gray-500">{prog.documentos.toLocaleString('pt-BR')} documentos analisados · {prog.restantes} restantes</span>
          </div>
          <div className="h-2.5 bg-[#0f1117] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog.pct}%`, background: prog.rodando ? 'linear-gradient(90deg,#6366f1,#10b981)' : '#10b981' }} />
          </div>
          {prog.rodando && <p className="text-[11px] text-gray-600 mt-1.5">Processando em segundo plano · atualiza sozinho a cada 10s</p>}
        </div>
      )}

      {loading ? (
        <div className="text-center py-24 text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Lendo o SharePoint…</div>
      ) : data?.erro ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 inline mr-2" /> {data.erro}
        </div>
      ) : data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clientes" value={data.totalClientes} icon={Building2} />
            <Kpi label="Documentos" value={data.totalDocs} icon={FileText} color="text-indigo-400" />
            <Kpi label="Sem regime no nome" value={data.semRegime} icon={AlertTriangle} color={data.semRegime ? 'text-amber-400' : 'text-gray-400'} />
            <Kpi label="Sem documentos" value={data.semDocs} icon={FolderOpen} color={data.semDocs ? 'text-red-400' : 'text-emerald-400'} />
          </div>

          {/* Gráficos */}
          <div className="grid md:grid-cols-2 gap-5">
            <Card title="Clientes por regime tributário">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={data.porRegime} dataKey="clientes" nameKey="regime" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.regime.split(' ')[0]} (${e.clientes})`}>
                    {data.porRegime.map((r: any, i: number) => <Cell key={i} fill={CORES[r.regime] ?? '#64748b'} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Documentos por regime">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={data.porRegime}>
                  <XAxis dataKey="regime" stroke="#64748b" fontSize={10} tickFormatter={(v: string) => v.split(' ')[0]} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#1e274055' }} />
                  <Bar dataKey="docs" radius={[4, 4, 0, 0]}>
                    {data.porRegime.map((r: any, i: number) => <Cell key={i} fill={CORES[r.regime] ?? '#64748b'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou código…"
                className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 placeholder-gray-600" />
            </div>
            <select value={regimeFiltro} onChange={(e) => setRegimeFiltro(e.target.value)} className="bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500">
              <option value="">Todos os regimes</option>
              {data.porRegime.map((r: any) => <option key={r.regime} value={r.regime}>{r.regime} ({r.clientes})</option>)}
            </select>
          </div>

          {/* Tabela */}
          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                  <th className="px-4 py-3 font-medium">Cód.</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Regime</th>
                  <th className="px-4 py-3 font-medium text-right">Documentos</th>
                  <th className="px-4 py-3 font-medium text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2740]">
                {clientes.slice(0, 300).map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 text-gray-500 font-mono">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white">{c.nome}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: (CORES[c.regime] ?? '#64748b') + '22', color: CORES[c.regime] ?? '#94a3b8' }}>{c.regimeSigla ?? '?'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-300">{c.docs}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] ${c.ativo ? 'text-emerald-400' : 'text-gray-500'}`}>{c.ativo ? 'Ativa' : 'Inativa'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-600 text-center">Mostrando {Math.min(clientes.length, 300)} de {clientes.length} · lido do SharePoint em {data.atualizadoEm ? new Date(data.atualizadoEm).toLocaleString('pt-BR') : '—'}</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color = 'text-white' }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-gray-500">{label}</span><Icon className="h-3.5 w-3.5 text-gray-500" /></div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
function Card({ title, children }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <h2 className="text-sm font-medium text-white mb-3">{title}</h2>
      {children}
    </div>
  );
}
