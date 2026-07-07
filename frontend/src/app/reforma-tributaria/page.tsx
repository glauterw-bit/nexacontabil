'use client';
import { useEffect, useState } from 'react';
import { Calculator, Loader2, TrendingUp, TrendingDown, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, COLORS, tint, Kpi } from '@/components/ui/kit';

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
    <div className="page space-y-5">
      <PageHeader
        icon={<Calculator size={22} color={COLORS.acao} />}
        title="Reforma Tributária — CBS/IBS"
        subtitle="Simulador da transição tributária 2026-2033. Compara a carga atual com o novo regime CBS/IBS ano a ano, com reduções setoriais aplicadas."
        action={
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-inset text-tx-muted border border-line rounded">
            LC 214/2025
          </span>
        }
      />

      {/* Form de simulação */}
      <div className="card-aura space-y-3">
        <h3 className="text-[15px] font-semibold text-tx-strong m-0">Simular impacto na empresa</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase text-tx-muted tracking-wider mb-1 block">
              Receita anual estimada
            </label>
            <input
              type="number"
              value={receita}
              onChange={(e) => setReceita(Number(e.target.value))}
              className="input-aura w-full"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-tx-muted tracking-wider mb-1 block">
              Regime atual
            </label>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="input-aura w-full"
            >
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
              <option value="LUCRO_REAL">Lucro Real</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-tx-muted tracking-wider mb-1 block">
              Setor (redução LC 214)
            </label>
            <select
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              className="input-aura w-full"
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
          className="btn-primary"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
          Simular
        </button>
      </div>

      {/* Tabela de transição */}
      {table && (
        <div className="card-aura overflow-x-auto">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-3">Cronograma oficial (LC 214/2025)</h3>
          <table className="table-aura">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">IBS</th>
                <th className="num">CBS</th>
                <th className="num">PIS/COFINS</th>
                <th className="num">ICMS</th>
                <th className="num">ISS</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(table.rates).map(([ano, r]) => (
                <tr key={ano}>
                  <td className="text-tx-strong font-semibold">{ano}</td>
                  <td className="num text-tx-strong">{r.ibs}%</td>
                  <td className="num text-tx-strong">{r.cbs}%</td>
                  <td className="num text-tx-muted">{r.pisCofins}%</td>
                  <td className="num text-tx-muted">{r.icms}%</td>
                  <td className="num text-tx-muted">{r.iss}%</td>
                  <td className="text-[10px] text-warn">{r.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resultado da simulação */}
      {result && (
        <div className="rounded-xl p-5 space-y-3"
          style={{ background: tint(COLORS.dotOk, 5), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
          <h3 className="text-[15px] font-semibold text-tx-strong m-0">Resultado da simulação</h3>

          <div className="flex flex-wrap gap-3">
            <Kpi label="Economia acumulada" value={brl(result.sumario.economiaTotalNoPeriodo)} cor={COLORS.ok} />
            <Kpi label="Aumento acumulado" value={brl(result.sumario.aumentoTotalNoPeriodo)} cor={COLORS.erro} />
            <Kpi label="Impacto líquido" value={brl(result.sumario.impactoLiquido)} cor={result.sumario.impactoLiquido > 0 ? COLORS.erro : COLORS.ok} />
          </div>

          <div className="rounded-lg p-3 flex gap-2 items-start"
            style={{ background: tint(COLORS.info, 8), border: `1px solid ${tint(COLORS.info, 25)}` }}>
            <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <p className="text-xs text-tx">{result.sumario.recomendacao}</p>
          </div>

          <table className="table-aura">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Regime atual</th>
                <th className="num">Novo (CBS/IBS)</th>
                <th className="num">Diferença</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {result.linhas.map((l) => (
                <tr key={l.ano}>
                  <td className="text-tx-strong">{l.ano}</td>
                  <td className="num">{brl(l.cargaAtual)}</td>
                  <td className="num">{brl(l.cargaNovo)}</td>
                  <td className={`num ${l.diferenca > 0 ? 'text-err' : 'text-ok'}`}>
                    {brl(l.diferenca)}
                  </td>
                  <td className={`num ${l.pctDiferenca > 0 ? 'text-err' : 'text-ok'}`}>
                    {l.pctDiferenca > 0 ? '+' : ''}{l.pctDiferenca.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-xl p-3 flex gap-2 items-start"
        style={{ background: tint(COLORS.dotAtencao, 8), border: `1px solid ${tint(COLORS.dotAtencao, 30)}` }}>
        <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
        <p className="text-xs text-warn leading-relaxed">
          Cálculos baseados em estimativas médias. Alíquotas finais IBS dependem da regulamentação
          complementar e podem variar conforme estado/município. Reduções setoriais conforme art. 9º
          a 12º da LC 214/2025. Não substitui análise contábil específica.
        </p>
      </div>
    </div>
  );
}
