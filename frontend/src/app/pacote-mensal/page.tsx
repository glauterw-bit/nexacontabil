'use client';
import { useEffect, useState } from 'react';
import {
  Sparkles, Printer, TrendingUp, TrendingDown, Users, FileText,
  CheckCircle2, AlertTriangle, Calendar, Building2, Loader2, Mail,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const brl = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export default function PacoteMensalPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [ano, setAno] = useState(prev.getFullYear());
  const [mes, setMes] = useState(prev.getMonth() + 1);
  const [pack, setPack] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const companyId = selectedCompany?.id ?? '';

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setPack(null);
    const token = localStorage.getItem('aura_token') ?? '';
    try {
      const r = await fetch(`${API}/api/v1/monthly-package?companyId=${companyId}&ano=${ano}&mes=${mes}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setPack(d);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId, ano, mes]);

  function imprimir() {
    window.print();
  }

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Gerenciar</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl print:max-w-none print:p-0">
      {/* Controls (omitidos no print) */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Pacote Mensal do Cliente</h1>
          </div>
          <p className="text-sm text-gray-400">Resumo executivo de 1 página gerado por IA</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={`${ano}-${String(mes).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setAno(y); setMes(m);
            }}
            className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none"
          />
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1e2740] hover:bg-[#2a3550] text-white rounded-lg"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Regenerar
          </button>
          <button
            onClick={imprimir}
            disabled={!pack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Coletando dados do mês e gerando resumo com IA…
        </div>
      )}

      {pack && (
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-2xl p-8 print:bg-white print:border-0 print:p-0 space-y-6 print:text-gray-900">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between flex-wrap gap-4 border-b border-[#1e2740] print:border-gray-300 pb-5">
            <div>
              <p className="text-xs text-gray-500 print:text-gray-600 uppercase tracking-wider">Relatório Gerencial Mensal</p>
              <h2 className="text-xl font-bold text-white print:text-gray-900 mt-1">{pack.company.name}</h2>
              <p className="text-xs text-gray-400 print:text-gray-600 mt-1 font-mono">
                CNPJ {pack.company.cnpj} · {pack.company.taxRegime.replace('_', ' ')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 print:text-gray-600">Competência</p>
              <p className="text-base font-bold text-white print:text-gray-900 capitalize">{pack.period.label}</p>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="bg-indigo-500/5 print:bg-gray-50 border border-indigo-500/30 print:border-gray-300 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-indigo-400 print:text-indigo-600" />
              <p className="text-xs font-medium text-indigo-300 print:text-indigo-700 uppercase tracking-wider">
                Resumo Executivo
              </p>
            </div>
            <p className="text-sm text-gray-200 print:text-gray-900 leading-relaxed">
              {pack.executiveSummary}
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI
              label="Resultado do mês"
              value={brl(pack.financeiro.netResult)}
              icon={pack.financeiro.netResult >= 0 ? TrendingUp : TrendingDown}
              color={pack.financeiro.netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <KPI label="Receitas" value={brl(pack.financeiro.totalCredit)} />
            <KPI label="Despesas" value={brl(pack.financeiro.totalDebit)} />
            <KPI label="Documentos" value={String(pack.operacao.documentosProcessados)} icon={FileText} />
          </div>

          {/* Folha + Bancos lado a lado */}
          <div className="grid md:grid-cols-2 gap-4">
            <Section icon={Users} title="Folha de pagamento">
              <Line label="Funcionários" value={String(pack.folha.funcionarios)} />
              <Line label="Salário bruto" value={brl(pack.folha.salarioBrutoTotal)} />
              <Line label="Salário líquido" value={brl(pack.folha.salarioLiquidoTotal)} highlight />
              <Line label="INSS (E + P)" value={brl(pack.folha.inss)} />
              <Line label="FGTS" value={brl(pack.folha.fgts)} />
            </Section>
            <Section icon={TrendingUp} title="Movimentação bancária">
              <Line label="Entradas" value={brl(pack.financeiro.bankCredits)} positive />
              <Line label="Saídas" value={brl(pack.financeiro.bankDebits)} negative />
              <Line label="Saldo do mês" value={brl(pack.financeiro.bankNet)} highlight />
            </Section>
          </div>

          {/* Obrigações fiscais */}
          <Section icon={CheckCircle2} title="Obrigações fiscais">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <MiniKPI label="Pagas" value={pack.obrigacoes.pagas} color="text-emerald-400" />
              <MiniKPI label="Pendentes" value={pack.obrigacoes.pendentes} color={pack.obrigacoes.pendentes > 0 ? 'text-amber-400' : 'text-gray-300'} />
              <MiniKPI label="Valor pago" value={brl(pack.obrigacoes.valorTotal)} mono />
            </div>
            {pack.obrigacoes.detalhe.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 print:text-gray-600 border-b border-[#1e2740] print:border-gray-300">
                    <th className="pb-1 font-medium">Tipo</th>
                    <th className="pb-1 font-medium">Vencimento</th>
                    <th className="pb-1 font-medium">Status</th>
                    <th className="pb-1 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2740] print:divide-gray-200">
                  {pack.obrigacoes.detalhe.slice(0, 6).map((o: any, i: number) => (
                    <tr key={i}>
                      <td className="py-1 text-gray-200 print:text-gray-900 font-medium">{o.tipo}</td>
                      <td className="py-1 text-gray-400 print:text-gray-700">{new Date(o.vencimento).toLocaleDateString('pt-BR')}</td>
                      <td className="py-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          o.status === 'paga'
                            ? 'bg-emerald-500/20 text-emerald-300 print:bg-green-100 print:text-green-800'
                            : 'bg-amber-500/20 text-amber-300 print:bg-yellow-100 print:text-yellow-800'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-1 text-right font-mono text-gray-300 print:text-gray-900">{o.valorPago ? brl(o.valorPago) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Próximos 30 dias */}
          {pack.proximasObrigacoes.length > 0 && (
            <Section icon={Calendar} title="Próximas obrigações (30 dias)">
              <div className="space-y-1">
                {pack.proximasObrigacoes.map((o: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 print:text-gray-900">
                      <span className="font-medium">{o.tipo}</span> — {o.descricao}
                    </span>
                    <span className="text-amber-400 print:text-amber-700 font-mono text-[11px]">
                      {new Date(o.vencimento).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Footer */}
          <div className="text-[10px] text-gray-500 print:text-gray-500 pt-4 border-t border-[#1e2740] print:border-gray-300">
            Gerado pelo NexaContábil em {new Date(pack.generatedAt).toLocaleString('pt-BR')} ·
            Documento informativo, não substitui o balancete oficial.
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] print:border-gray-300 bg-[#0f1117] print:bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`h-3.5 w-3.5 ${color || 'text-gray-400 print:text-gray-600'}`} />}
        <p className="text-xs text-gray-500 print:text-gray-600">{label}</p>
      </div>
      <p className={`text-base font-bold ${color || 'text-white print:text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] print:border-gray-300 p-4">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-indigo-400 print:text-indigo-700" />}
        <h3 className="text-sm font-medium text-white print:text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Line({ label, value, positive, negative, highlight }: any) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-gray-400 print:text-gray-600">{label}</span>
      <span className={`font-mono ${
        positive ? 'text-emerald-400 print:text-green-700'
        : negative ? 'text-red-400 print:text-red-700'
        : highlight ? 'text-white print:text-gray-900 font-bold'
        : 'text-gray-200 print:text-gray-900'
      }`}>{value}</span>
    </div>
  );
}

function MiniKPI({ label, value, color, mono }: any) {
  return (
    <div className="rounded-lg bg-[#0f1117] print:bg-gray-50 border border-[#1e2740] print:border-gray-300 p-2 text-center">
      <p className="text-[10px] text-gray-500 print:text-gray-600 uppercase">{label}</p>
      <p className={`text-sm font-bold ${color || 'text-white print:text-gray-900'} ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
