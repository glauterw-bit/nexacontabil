'use client';
import { useEffect, useState } from 'react';
import { Calculator, Loader2, TrendingUp, TrendingDown, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface TableData {
  rates: Record<string, { ibs: number; cbs: number; pisCofins: number; icms: number; iss: number; status: string }>;
  setores: Record<string, number>;
}

interface SimResult {
  input: any;
  setorReducao: number;
  linhas: Array<{
    ano: number;
    rates: any;
    cargaNovo: number;
    cargaAtual: number;
    diferenca: number;
    pctDiferenca: number;
    impacto: 'aumento' | 'reducao';
  }>;
  sumario: {
    economiaTotalNoPeriodo: number;
    aumentoTotalNoPeriodo: number;
    impactoLiquido: number;
    recomendacao: string;
  };
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function ReformaTributariaPage() {
  const toast = useToast();
  const [table, setTable] = useState<TableData | null>(null);
  const [receita, setReceita] = useState(1200000);
  const [setor, setSetor] = useState('geral');
  const [regime, setRegime] = useState('LUCRO_PRESUMIDO');
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/tax-reform/cbs-ibs/transition-table`, { headers: authHeaders() })
      .then((r) => r.json())
      .then(setTable)
      .catch(() => undefined);
  }, []);

  async function simulate() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/tax-reform/cbs-ibs/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          receitaAnual: receita,
          setor,
          regimeAtual: regime,
          anosBase: [2026, 2027, 2029, 2031, 2033],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'erro');
      setResult(d);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Calculator className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Reforma Tributária — CBS/IBS</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
            LC 214/2025
          </span>
        </div>
        <p className="text-sm text-gray-400 max-w-3xl">
          Simulador da transição tributária 2026-2033. Compara a carga atual com o novo regime CBS/IBS
          ano a ano, com reduções setoriais aplicadas.
        </p>
      </div>

      {/* Form de simulação */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-3">
        <h2 className="text-sm font-medium text-white">Simular impacto na empresa</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
              Receita anual estimada
            </label>
            <input
              type="number"
              value={receita}
              onChange={(e) => setReceita(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-sm text-white outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
              Regime atual
            </label>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-sm text-white outline-none"
            >
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
              <option value="LUCRO_REAL">Lucro Real</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-gray-500 tracking-wider mb-1 block">
              Setor (redução LC 214)
            </label>
            <select
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-sm text-white outline-none"
            >
              {table && Object.keys(table.setores).map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, ' ')} ({table.setores[k]}% redução)
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={simulate}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded inline-flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
          Simular
        </button>
      </div>

      {/* Tabela de transição */}
      {table && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
          <h2 className="text-sm font-medium text-white mb-3">Cronograma oficial (LC 214/2025)</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#1e2740]">
                <th className="pb-2 font-medium">Ano</th>
                <th className="pb-2 font-medium text-right">IBS</th>
                <th className="pb-2 font-medium text-right">CBS</th>
                <th className="pb-2 font-medium text-right">PIS/COFINS</th>
                <th className="pb-2 font-medium text-right">ICMS</th>
                <th className="pb-2 font-medium text-right">ISS</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740] font-mono">
              {Object.entries(table.rates).map(([ano, r]) => (
                <tr key={ano} className="hover:bg-white/5">
                  <td className="py-1.5 text-white font-semibold">{ano}</td>
                  <td className="py-1.5 text-right text-emerald-300">{r.ibs}%</td>
                  <td className="py-1.5 text-right text-indigo-300">{r.cbs}%</td>
                  <td className="py-1.5 text-right text-gray-400">{r.pisCofins}%</td>
                  <td className="py-1.5 text-right text-gray-400">{r.icms}%</td>
                  <td className="py-1.5 text-right text-gray-400">{r.iss}%</td>
                  <td className="py-1.5 text-[10px] text-amber-300">{r.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resultado da simulação */}
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
          <h2 className="text-sm font-medium text-white">Resultado da simulação</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KPI label="Economia acumulada" value={brl(result.sumario.economiaTotalNoPeriodo)} color="text-emerald-400" icon={TrendingDown} />
            <KPI label="Aumento acumulado" value={brl(result.sumario.aumentoTotalNoPeriodo)} color="text-red-400" icon={TrendingUp} />
            <KPI label="Impacto líquido" value={brl(result.sumario.impactoLiquido)} color={result.sumario.impactoLiquido > 0 ? 'text-red-400' : 'text-emerald-400'} />
          </div>

          <div className="rounded-lg bg-[#0f1117] border border-[#1e2740] p-3 flex gap-2 items-start">
            <Info className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-300">{result.sumario.recomendacao}</p>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#1e2740]">
                <th className="pb-2 font-medium">Ano</th>
                <th className="pb-2 font-medium text-right">Regime atual</th>
                <th className="pb-2 font-medium text-right">Novo (CBS/IBS)</th>
                <th className="pb-2 font-medium text-right">Diferença</th>
                <th className="pb-2 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740] font-mono">
              {result.linhas.map((l) => (
                <tr key={l.ano}>
                  <td className="py-1.5 text-white">{l.ano}</td>
                  <td className="py-1.5 text-right text-gray-300">{brl(l.cargaAtual)}</td>
                  <td className="py-1.5 text-right text-gray-300">{brl(l.cargaNovo)}</td>
                  <td className={`py-1.5 text-right ${l.diferenca > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {brl(l.diferenca)}
                  </td>
                  <td className={`py-1.5 text-right ${l.pctDiferenca > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {l.pctDiferenca > 0 ? '+' : ''}{l.pctDiferenca.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 items-start">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300 leading-relaxed">
          Cálculos baseados em estimativas médias. Alíquotas finais IBS dependem da regulamentação
          complementar e podem variar conforme estado/município. Reduções setoriais conforme art. 9º
          a 12º da LC 214/2025. Não substitui análise contábil específica.
        </p>
      </div>
    </div>
  );
}

function KPI({ label, value, color, icon: Icon }: any) {
  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`h-3.5 w-3.5 ${color}`} />}
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
