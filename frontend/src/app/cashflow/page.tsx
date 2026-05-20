'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, Loader2, RefreshCw,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface CashFlowData {
  fcoOperacionais: number;
  fcoInvestimento: number;
  fcoFinanciamento: number;
  variacaoCaixa: number;
  saldoInicial: number;
  saldoFinal: number;
  rubricasJson: string;
  periodoInicio: string;
  periodoFim: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function brl(n: number | null | undefined) {
  return (n == null ? 0 : n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthRange(ano: number, mes: number) {
  return {
    inicio: new Date(ano, mes, 1).toISOString(),
    fim: new Date(ano, mes + 1, 0, 23, 59, 59).toISOString(),
  };
}

export default function CashflowPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth());
  const [dfc, setDfc] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!selectedCompany) return;
    setLoading(true);
    setDfc(null);
    try {
      const { inicio, fim } = monthRange(ano, mes);
      const r = await fetch(`${API}/api/v1/financial-statements/dfc/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          periodoInicio: inicio,
          periodoFim: fim,
          metodo: 'indireto',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'erro');
      setDfc(d);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedCompany?.id, ano, mes]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Gerenciar</Link>
      </div>
    );
  }

  // Constrói série de saldo acumulado a partir das rubricas
  let chartData: any[] = [];
  if (dfc) {
    try {
      const r = JSON.parse(dfc.rubricasJson);
      let acc = dfc.saldoInicial;
      chartData.push({ etapa: 'Saldo inicial', valor: acc });
      for (const op of r.operacionais ?? []) {
        acc += Number(op.valor || 0);
        chartData.push({ etapa: op.descricao.slice(0, 24), valor: acc, tipo: 'operacional' });
      }
      for (const inv of r.investimento ?? []) {
        acc += Number(inv.valor || 0);
        chartData.push({ etapa: inv.descricao.slice(0, 24), valor: acc, tipo: 'investimento' });
      }
      for (const fin of r.financiamento ?? []) {
        acc += Number(fin.valor || 0);
        chartData.push({ etapa: fin.descricao.slice(0, 24), valor: acc, tipo: 'financiamento' });
      }
      chartData.push({ etapa: 'Saldo final', valor: dfc.saldoFinal });
    } catch {}
  }

  const periodLabel = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <TrendingUp className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Fluxo de Caixa</h1>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCompany.name} · DFC pelo método indireto · {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={`${ano}-${String(mes + 1).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setAno(y); setMes(m - 1);
            }}
            className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded text-xs text-white outline-none"
          />
          <button onClick={generate} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Gerando DFC a partir dos lançamentos…
        </div>
      )}

      {!loading && dfc && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Operacional (FCO)" value={brl(dfc.fcoOperacionais)} icon={TrendingUp} color={dfc.fcoOperacionais >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <KPI label="Investimento (FCI)" value={brl(dfc.fcoInvestimento)} color={dfc.fcoInvestimento >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <KPI label="Financiamento (FCF)" value={brl(dfc.fcoFinanciamento)} color={dfc.fcoFinanciamento >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <KPI label="Variação líquida" value={brl(dfc.variacaoCaixa)} icon={dfc.variacaoCaixa >= 0 ? TrendingUp : TrendingDown} color={dfc.variacaoCaixa >= 0 ? 'text-emerald-400' : 'text-red-400'} highlight />
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Caminho do caixa no período</h2>
            {chartData.length > 1 ? (
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2740" />
                    <XAxis dataKey="etapa" angle={-30} textAnchor="end" tick={{ fontSize: 9, fill: '#9ca3af' }} height={70} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => brl(v)}
                    />
                    <ReferenceLine y={0} stroke="#f87171" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="valor" stroke="#818cf8" strokeWidth={2} dot={{ r: 4, fill: '#818cf8' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-8">
                Sem transações suficientes no período. Lance documentos em /transactions ou suba uma pasta em /inteligencia.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Estrutura DFC</h2>
            <div className="space-y-2 text-sm">
              <Row label="Saldo inicial" value={dfc.saldoInicial} />
              <Row label="(+/-) Atividades operacionais" value={dfc.fcoOperacionais} bold />
              <Row label="(+/-) Atividades de investimento" value={dfc.fcoInvestimento} bold />
              <Row label="(+/-) Atividades de financiamento" value={dfc.fcoFinanciamento} bold />
              <Row label="(=) Variação líquida no caixa" value={dfc.variacaoCaixa} bold highlight />
              <Row label="(=) Saldo final" value={dfc.saldoFinal} bold />
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex gap-2 text-xs text-blue-300">
            <Brain className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              DFC método indireto gerada automaticamente a partir das transações aprovadas. Para uma DFC
              manual com rubricas detalhadas, use o módulo /financial-statements/dfc completo via API.
            </p>
          </div>
        </>
      )}

      {!loading && !dfc && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Sem dados para gerar fluxo de caixa</p>
          <p className="text-xs text-gray-500 mt-1">
            Lance transações em /transactions para o mês selecionado.
          </p>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color, highlight }: any) {
  return (
    <div className={`rounded-xl border bg-[#161b2e] p-4 ${highlight ? 'border-indigo-500/40' : 'border-[#1e2740]'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`h-3.5 w-3.5 ${color || 'text-gray-400'}`} />}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, highlight }: any) {
  return (
    <div className={`flex justify-between py-1 ${highlight ? 'border-t border-[#1e2740] pt-2 mt-1' : ''}`}>
      <span className={`text-gray-400 ${bold ? 'text-white font-medium' : ''}`}>{label}</span>
      <span className={`font-mono ${(value ?? 0) < 0 ? 'text-red-400' : 'text-emerald-300'} ${bold ? 'font-bold' : ''}`}>{brl(value)}</span>
    </div>
  );
}
