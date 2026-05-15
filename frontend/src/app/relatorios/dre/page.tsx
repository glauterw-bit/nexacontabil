'use client';
import { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Download, Brain, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const GET_DRE = gql`
  query GetDRE($companyId: String!, $from: String!, $to: String!) {
    getDRE(companyId: $companyId, from: $from, to: $to) {
      companyId
      period { from to }
      grossRevenue totalCosts grossProfit operationalExpenses
      ebit financialResult ebt taxes netIncome
      generatedAt
      groups {
        code name totalDebit totalCredit net
        accounts { code name debit credit net }
      }
    }
  }
`;

const brl = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

function monthDates(y: number, m: number) {
  const from = new Date(y, m, 1, 0, 0, 0).toISOString();
  const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
  return { from, to };
}

export default function DREPage() {
  const { selectedCompany } = useCompany();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());

  const { from, to } = useMemo(() => monthDates(ano, mes), [ano, mes]);
  const companyId = selectedCompany?.id ?? '';

  const { data, loading, error } = useQuery(GET_DRE, {
    variables: { companyId, from, to },
    skip: !companyId,
  });

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para gerar o DRE.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
          Gerenciar Empresas
        </Link>
      </div>
    );
  }

  const dre = data?.getDRE;
  const periodLabel = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const chartData = (dre?.groups ?? []).map((g: any) => ({
    name: g.name.length > 18 ? g.name.slice(0, 16) + '…' : g.name,
    valor: Math.abs(g.net),
    isNegative: g.net < 0,
  }));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Demonstração do Resultado (DRE)</h1>
          <p className="text-gray-400 text-sm mt-0.5">{selectedCompany.name} · {periodLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={`${ano}-${String(mes + 1).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setAno(y); setMes(m - 1);
            }}
            className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none focus:border-indigo-500/50"
          />
          <button disabled className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-[#1e2740] rounded-lg cursor-not-allowed" title="Em breve">
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando DRE com base nos lançamentos…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
          Erro ao gerar DRE: {error.message}
        </div>
      ) : !dre || (dre.groups?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <Brain className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Sem lançamentos no período</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Não há transações contábeis aprovadas neste mês. Lance documentos em <Link href="/transactions" className="text-indigo-400 hover:underline">Lançamentos</Link> ou
            use a <Link href="/inteligencia" className="text-indigo-400 hover:underline">Análise IA em lote</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Receita Bruta" value={brl(dre.grossRevenue)} icon={TrendingUp} color="text-emerald-400" />
            <KPI label="Lucro Bruto" value={brl(dre.grossProfit)} color="text-blue-400" />
            <KPI label="EBIT" value={brl(dre.ebit)} color={dre.ebit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <KPI label="Lucro Líquido" value={brl(dre.netIncome)} color={dre.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'} highlight />
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Resumo do período</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <Row label="(=) Receita Bruta" value={dre.grossRevenue} />
              <Row label="(-) Custos" value={-dre.totalCosts} negative />
              <Row label="(=) Lucro Bruto" value={dre.grossProfit} bold />
              <Row label="(-) Despesas Operacionais" value={-dre.operationalExpenses} negative />
              <Row label="(=) EBIT" value={dre.ebit} bold />
              <Row label="(+/-) Resultado Financeiro" value={dre.financialResult} />
              <Row label="(=) Lucro Antes do IR" value={dre.ebt} bold />
              <Row label="(-) IR + CSLL" value={-dre.taxes} negative />
              <Row label="(=) LUCRO LÍQUIDO" value={dre.netIncome} bold highlight />
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Composição por grupo de contas</h2>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10, fill: '#9ca3af' }} height={50} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => brl(v)} />
                  <Bar dataKey="valor">
                    {chartData.map((d: any, i: number) => (
                      <Cell key={i} fill={d.isNegative ? '#f87171' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Detalhamento por conta</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                  <th className="pb-2 font-medium">Conta</th>
                  <th className="pb-2 font-medium text-right">Débito</th>
                  <th className="pb-2 font-medium text-right">Crédito</th>
                  <th className="pb-2 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2740]">
                {dre.groups.map((g: any) => (
                  <Bloco key={g.code} group={g} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-600">
            Gerado em {new Date(dre.generatedAt).toLocaleString('pt-BR')}. Inclui transações com status approved/posted no período.
          </p>
        </>
      )}
    </div>
  );
}

function Bloco({ group }: { group: any }) {
  return (
    <>
      <tr className="bg-[#0f1117]">
        <td className="py-2 font-medium text-indigo-300">{group.name}</td>
        <td className="py-2 text-right font-mono text-xs text-gray-400">{brl(group.totalDebit)}</td>
        <td className="py-2 text-right font-mono text-xs text-gray-400">{brl(group.totalCredit)}</td>
        <td className="py-2 text-right font-mono text-white font-semibold">{brl(group.net)}</td>
      </tr>
      {(group.accounts ?? []).map((a: any) => (
        <tr key={a.code} className="hover:bg-white/5">
          <td className="py-2 pl-4 text-gray-300 text-xs">
            <span className="text-gray-600 font-mono mr-2">{a.code}</span>
            {a.name}
          </td>
          <td className="py-2 text-right font-mono text-xs text-gray-400">{brl(a.debit)}</td>
          <td className="py-2 text-right font-mono text-xs text-gray-400">{brl(a.credit)}</td>
          <td className="py-2 text-right font-mono text-xs text-gray-200">{brl(a.net)}</td>
        </tr>
      ))}
    </>
  );
}

function KPI({ label, value, icon: Icon, color, highlight }: any) {
  return (
    <div className={`rounded-xl border bg-[#161b2e] p-4 ${highlight ? 'border-indigo-500/40' : 'border-[#1e2740]'}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {Icon && <Icon className={`h-4 w-4 ${color || 'text-gray-400'}`} />}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, negative, highlight }: any) {
  return (
    <div className={`flex justify-between py-1 ${highlight ? 'pt-2 border-t border-[#1e2740] text-base' : ''}`}>
      <span className={`text-gray-400 ${bold ? 'text-white font-medium' : ''}`}>{label}</span>
      <span className={`font-mono ${negative ? 'text-red-300' : bold ? 'text-white' : 'text-gray-200'} ${bold ? 'font-bold' : ''}`}>
        {brl(value)}
      </span>
    </div>
  );
}
