'use client';
import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Area, AreaChart
} from 'recharts';
import { Brain, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

// Generate realistic cashflow data
function generateData() {
  const hoje = new Date(2026, 2, 23);
  const data: { data: string; real: number | null; previsto: number | null; inferior: number | null; superior: number | null; }[] = [];

  let saldo = 142800;
  // Historical - last 30 days
  for (let i = -30; i <= 0; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const variacao = (Math.random() - 0.42) * 18000;
    saldo = Math.max(20000, saldo + variacao);
    data.push({ data: label, real: Math.round(saldo), previsto: null, inferior: null, superior: null });
  }

  // Future - next 90 days
  let salvel = saldo;
  for (let i = 1; i <= 90; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const tendencia = i <= 15 ? -2000 : i <= 45 ? 3000 : -1500;
    const ruido = (Math.random() - 0.5) * 12000;
    salvel = Math.max(-50000, salvel + tendencia / 30 + ruido);
    const confianca = Math.min(30000, i * 400);
    data.push({
      data: label,
      real: null,
      previsto: Math.round(salvel),
      inferior: Math.round(salvel - confianca),
      superior: Math.round(salvel + confianca),
    });
  }
  return data;
}

const ALL_DATA = generateData();
const saldoAtual = ALL_DATA.find(d => d.real !== null && ALL_DATA[ALL_DATA.indexOf(d) + 1]?.real === null)?.real || 142800;
const previsto30 = ALL_DATA.filter(d => d.previsto !== null)[29]?.previsto || 0;
const previsto90 = ALL_DATA.filter(d => d.previsto !== null)[89]?.previsto || 0;
const burnMensal = (saldoAtual - (previsto30 || saldoAtual)) / 1;

export default function CashflowPage() {
  const { selectedCompany } = useCompany();
  const [periodo, setPeriodo] = useState<'30' | '60' | '90'>('90');

  const diasPassados = 30;
  const diasFuturos = parseInt(periodo);
  const displayData = ALL_DATA.slice(Math.max(0, 30 - diasPassados), 30 + diasFuturos + 1);

  const temRiscoNegativo = displayData.some(d => d.previsto !== null && (d.previsto || 0) < 0);
  const riscoData = ALL_DATA.filter(d => d.previsto !== null).find(d => (d.previsto || 0) < 0);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver o Fluxo de Caixa.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Fluxo de Caixa Preditivo</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Modelo IA com 90 dias de projeção</p>
        </div>
        <div className="flex rounded-lg border border-[#1e2740] overflow-hidden">
          {(['30', '60', '90'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`px-4 py-2 text-sm transition-colors ${periodo === p ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Saldo Atual</p>
          <p className={`text-xl font-bold font-mono ${saldoAtual >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {saldoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Hoje</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Projeção 30 dias</p>
          <p className={`text-xl font-bold font-mono ${(previsto30 || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            {(previsto30 || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Estimado</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Projeção 90 dias</p>
          <p className={`text-xl font-bold font-mono ${(previsto90 || 0) >= 0 ? 'text-indigo-400' : 'text-red-400'}`}>
            {(previsto90 || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-gray-500 mt-1">Estimado</p>
        </div>
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-1">
            {burnMensal > 0 ? <TrendingDown className="h-3.5 w-3.5 text-red-400" /> : <TrendingUp className="h-3.5 w-3.5 text-green-400" />}
            <p className="text-xs text-gray-500">Variação/mês</p>
          </div>
          <p className={`text-xl font-bold font-mono ${burnMensal <= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {Math.abs(burnMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-gray-500 mt-1">{burnMensal > 0 ? 'Queima' : 'Crescimento'}</p>
        </div>
      </div>

      {/* Risk alert */}
      {temRiscoNegativo && (
        <div className="flex items-start gap-3 bg-red-400/10 border border-red-400/30 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-semibold">Alerta: Saldo negativo projetado</p>
            <p className="text-gray-300 text-sm mt-1">
              O modelo prevê saldo negativo em {riscoData?.data || 'breve'}. Considere antecipar recebíveis ou negociar prazos com fornecedores.
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="card-aura">
        <h2 className="text-base font-semibold text-white mb-4">
          Histórico (30d) + Projeção ({periodo}d)
          <span className="ml-3 text-xs text-gray-500">Linha sólida = real · Tracejada = projeção · Área = intervalo de confiança</span>
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2740" />
            <XAxis dataKey="data" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
              interval={Math.floor(displayData.length / 8)} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#161b2e', border: '1px solid #1e2740', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af', fontSize: 11 }}
              formatter={(v: number, name: string) => [v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), name === 'real' ? 'Real' : name === 'previsto' ? 'Previsto' : name === 'superior' ? 'Máx' : 'Mín']}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} />
            <Area type="monotone" dataKey="superior" stroke="none" fill="#22d3ee" fillOpacity={0.08} />
            <Area type="monotone" dataKey="inferior" stroke="none" fill="#0f1117" fillOpacity={1} />
            <Area type="monotone" dataKey="real" stroke="#6366f1" strokeWidth={2} fill="url(#gradReal)" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="previsto" stroke="#22d3ee" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* AI Analysis */}
      <div className="card-aura">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" /> Análise Preditiva da IA
        </h3>
        <div className="text-sm text-gray-300 space-y-2 leading-relaxed">
          <p>O saldo atual de <strong className="text-white">{saldoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> apresenta tendência de <strong className={burnMensal > 0 ? 'text-red-400' : 'text-green-400'}>{burnMensal > 0 ? 'redução' : 'crescimento'}</strong> nos próximos 90 dias baseada nos padrões históricos de receitas e despesas.</p>
          <p>Períodos de maior risco identificados: <strong className="text-yellow-400">início de mês</strong> (vencimento de obrigações fiscais e folha de pagamento) e <strong className="text-yellow-400">final do trimestre</strong> (IRPJ/CSLL estimativa).</p>
          <p>Recomendação: manter reserva mínima de <strong className="text-indigo-400">R$ 80.000</strong> para cobrir 2 meses de despesas fixas. O modelo tem confiança de 78% nesta projeção.</p>
        </div>
      </div>
    </div>
  );
}
