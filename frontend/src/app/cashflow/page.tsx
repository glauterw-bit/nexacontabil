'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, RefreshCw,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, SectionTitle, EmptyState, Spinner, COLORS } from '@/components/ui/kit';

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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar</Link>
        </div>
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
    <div className="page space-y-5">
      <PageHeader
        icon={<TrendingUp size={22} color={COLORS.acao} />}
        title="Fluxo de Caixa"
        subtitle={`${selectedCompany.name} · DFC pelo método indireto · ${periodLabel}`}
        action={
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={`${ano}-${String(mes + 1).padStart(2, '0')}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setAno(y); setMes(m - 1);
              }}
              className="input-aura"
            />
            <button onClick={generate} className="btn-primary">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>
        }
      />

      {loading && <Spinner />}

      {!loading && dfc && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Operacional (FCO)" value={brl(dfc.fcoOperacionais)} icon={TrendingUp} color={dfc.fcoOperacionais >= 0 ? 'text-ok' : 'text-err'} />
            <KPI label="Investimento (FCI)" value={brl(dfc.fcoInvestimento)} color={dfc.fcoInvestimento >= 0 ? 'text-ok' : 'text-err'} />
            <KPI label="Financiamento (FCF)" value={brl(dfc.fcoFinanciamento)} color={dfc.fcoFinanciamento >= 0 ? 'text-ok' : 'text-err'} />
            <KPI label="Variação líquida" value={brl(dfc.variacaoCaixa)} icon={dfc.variacaoCaixa >= 0 ? TrendingUp : TrendingDown} color={dfc.variacaoCaixa >= 0 ? 'text-ok' : 'text-err'} />
          </div>

          <div className="card-aura">
            <SectionTitle>Caminho do caixa no período</SectionTitle>
            {chartData.length > 1 ? (
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="etapa" angle={-30} textAnchor="end" tick={{ fontSize: 9, fill: 'var(--muted)' }} height={70} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => brl(v)}
                    />
                    <ReferenceLine y={0} stroke="var(--erro)" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="valor" stroke="var(--acao)" strokeWidth={2} dot={{ r: 4, fill: 'var(--acao)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-tx-muted text-center py-8">
                Sem transações suficientes no período. Lance documentos em /transactions ou suba uma pasta em /inteligencia.
              </p>
            )}
          </div>

          <div className="card-aura">
            <SectionTitle>Estrutura DFC</SectionTitle>
            <div className="space-y-2 text-sm">
              <Row label="Saldo inicial" value={dfc.saldoInicial} />
              <Row label="(+/-) Atividades operacionais" value={dfc.fcoOperacionais} bold />
              <Row label="(+/-) Atividades de investimento" value={dfc.fcoInvestimento} bold />
              <Row label="(+/-) Atividades de financiamento" value={dfc.fcoFinanciamento} bold />
              <Row label="(=) Variação líquida no caixa" value={dfc.variacaoCaixa} bold highlight />
              <Row label="(=) Saldo final" value={dfc.saldoFinal} bold />
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex gap-2 text-xs text-info">
            <Brain className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              DFC método indireto gerada automaticamente a partir das transações aprovadas. Para uma DFC
              manual com rubricas detalhadas, use o módulo /financial-statements/dfc completo via API.
            </p>
          </div>
        </>
      )}

      {!loading && !dfc && (
        <div className="card-aura">
          <EmptyState
            icon={<AlertTriangle size={40} />}
            title="Sem dados para gerar fluxo de caixa"
            sub="Lance transações em /transactions para o mês selecionado."
          />
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color }: any) {
  return (
    <div className="card-aura">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-tx-muted" />}
        <p className="text-xs text-tx-muted">{label}</p>
      </div>
      <p className={`num text-lg font-bold ${color || 'text-tx-strong'}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, highlight }: any) {
  return (
    <div className={`flex justify-between py-1 ${highlight ? 'border-t border-line pt-2 mt-1' : ''}`}>
      <span className={`text-tx-muted ${bold ? 'text-tx-strong font-medium' : ''}`}>{label}</span>
      <span className={`num ${(value ?? 0) < 0 ? 'text-err' : 'text-ok'} ${bold ? 'font-bold' : ''}`}>{brl(value)}</span>
    </div>
  );
}
