'use client';
import { useState, useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Download, Brain } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, EmptyState, Spinner, COLORS } from '@/components/ui/kit';

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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para gerar o DRE." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
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
    <div className="page space-y-6">
      <PageHeader
        icon={<TrendingUp size={22} color={COLORS.acao} />}
        title="Demonstração do Resultado (DRE)"
        subtitle={`${selectedCompany.name} · ${periodLabel}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="month"
              value={`${ano}-${String(mes + 1).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setAno(y); setMes(m - 1);
              }}
              className="input-aura"
            />
            <button disabled className="btn-secondary" title="Em breve">
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
          </div>
        }
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-err">
          Erro ao gerar DRE: {error.message}
        </div>
      ) : !dre || (dre.groups?.length ?? 0) === 0 ? (
        <div className="card-aura text-center">
          <EmptyState icon={<Brain size={40} />} title="Sem lançamentos no período" />
          <p className="text-xs text-tx-muted -mt-6 pb-6 max-w-md mx-auto">
            Não há transações contábeis aprovadas neste mês. Lance documentos em <Link href="/transactions" className="text-acao hover:underline">Lançamentos</Link> ou
            use a <Link href="/insights" className="text-acao hover:underline">Análise IA em lote</Link>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Receita Bruta" value={brl(dre.grossRevenue)} icon={TrendingUp} />
            <KPI label="Lucro Bruto" value={brl(dre.grossProfit)} />
            <KPI label="EBIT" value={brl(dre.ebit)} color={dre.ebit >= 0 ? 'text-ok' : 'text-err'} />
            <KPI label="Lucro Líquido" value={brl(dre.netIncome)} color={dre.netIncome >= 0 ? 'text-ok' : 'text-err'} />
          </div>

          <div className="card-aura">
            <SectionTitle>Resumo do período</SectionTitle>
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

          <div className="card-aura">
            <SectionTitle>Composição por grupo de contas</SectionTitle>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                  <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 10, fill: 'var(--muted)' }} height={50} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--tx)' }} formatter={(v: any) => brl(v)} />
                  <Bar dataKey="valor">
                    {chartData.map((d: any, i: number) => (
                      <Cell key={i} fill={d.isNegative ? 'var(--erro)' : 'var(--acao)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-aura">
            <SectionTitle>Detalhamento por conta</SectionTitle>
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th className="num">Débito</th>
                  <th className="num">Crédito</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {dre.groups.map((g: any) => (
                  <Bloco key={g.code} group={g} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-tx-faint">
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
      <tr className="bg-inset">
        <td className="font-medium text-tx-strong">{group.name}</td>
        <td className="num text-xs text-tx-muted">{brl(group.totalDebit)}</td>
        <td className="num text-xs text-tx-muted">{brl(group.totalCredit)}</td>
        <td className="num text-tx-strong font-semibold">{brl(group.net)}</td>
      </tr>
      {(group.accounts ?? []).map((a: any) => (
        <tr key={a.code}>
          <td className="pl-4 text-tx text-xs">
            <span className="num text-tx-faint mr-2">{a.code}</span>
            {a.name}
          </td>
          <td className="num text-xs text-tx-muted">{brl(a.debit)}</td>
          <td className="num text-xs text-tx-muted">{brl(a.credit)}</td>
          <td className="num text-xs text-tx">{brl(a.net)}</td>
        </tr>
      ))}
    </>
  );
}

function KPI({ label, value, icon: Icon, color }: any) {
  return (
    <div className="card-aura">
      <div className="flex items-center gap-2 mb-1.5">
        {Icon && <Icon className="h-4 w-4 text-tx-muted" />}
        <p className="text-xs text-tx-muted">{label}</p>
      </div>
      <p className={`num text-lg font-bold ${color || 'text-tx-strong'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, negative, highlight }: any) {
  return (
    <div className={`flex justify-between py-1 ${highlight ? 'pt-2 border-t border-line text-base' : ''}`}>
      <span className={`text-tx-muted ${bold ? 'text-tx-strong font-medium' : ''}`}>{label}</span>
      <span className={`num ${negative ? 'text-err' : bold ? 'text-tx-strong' : 'text-tx'} ${bold ? 'font-bold' : ''}`}>
        {brl(value)}
      </span>
    </div>
  );
}
