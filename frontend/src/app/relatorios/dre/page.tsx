'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Download, Brain, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface DRELinha {
  conta: string;
  tipo: 'titulo' | 'valor' | 'subtotal' | 'resultado';
  valorAtual: number | null;
  valorAnterior: number | null;
  nivel: number;
}

const MOCK_DRE: DRELinha[] = [
  { conta: 'RECEITA BRUTA', tipo: 'titulo', valorAtual: null, valorAnterior: null, nivel: 0 },
  { conta: 'Receita de Serviços', tipo: 'valor', valorAtual: 285000, valorAnterior: 252000, nivel: 1 },
  { conta: 'Receita de Produtos', tipo: 'valor', valorAtual: 48000, valorAnterior: 41000, nivel: 1 },
  { conta: '(-) Deduções da Receita', tipo: 'titulo', valorAtual: null, valorAnterior: null, nivel: 0 },
  { conta: 'Impostos sobre Receita (ISS/PIS/COFINS)', tipo: 'valor', valorAtual: -38200, valorAnterior: -33800, nivel: 1 },
  { conta: 'Devoluções e Descontos', tipo: 'valor', valorAtual: -2400, valorAnterior: -1800, nivel: 1 },
  { conta: 'RECEITA LÍQUIDA', tipo: 'subtotal', valorAtual: 292400, valorAnterior: 257400, nivel: 0 },
  { conta: '(-) Custos dos Serviços/Produtos', tipo: 'titulo', valorAtual: null, valorAnterior: null, nivel: 0 },
  { conta: 'Custo dos Serviços Prestados', tipo: 'valor', valorAtual: -98500, valorAnterior: -87200, nivel: 1 },
  { conta: 'Custo das Mercadorias Vendidas', tipo: 'valor', valorAtual: -28000, valorAnterior: -24100, nivel: 1 },
  { conta: 'LUCRO BRUTO', tipo: 'subtotal', valorAtual: 165900, valorAnterior: 146100, nivel: 0 },
  { conta: '(-) Despesas Operacionais', tipo: 'titulo', valorAtual: null, valorAnterior: null, nivel: 0 },
  { conta: 'Despesas com Pessoal', tipo: 'valor', valorAtual: -68200, valorAnterior: -62400, nivel: 1 },
  { conta: 'Despesas Administrativas', tipo: 'valor', valorAtual: -18600, valorAnterior: -16200, nivel: 1 },
  { conta: 'Despesas Comerciais', tipo: 'valor', valorAtual: -12400, valorAnterior: -10800, nivel: 1 },
  { conta: 'Depreciação e Amortização', tipo: 'valor', valorAtual: -4200, valorAnterior: -3900, nivel: 1 },
  { conta: 'EBITDA', tipo: 'subtotal', valorAtual: 66700, valorAnterior: 56700, nivel: 0 },
  { conta: '(+/-) Resultado Financeiro', tipo: 'titulo', valorAtual: null, valorAnterior: null, nivel: 0 },
  { conta: 'Receitas Financeiras', tipo: 'valor', valorAtual: 3200, valorAnterior: 2800, nivel: 1 },
  { conta: 'Despesas Financeiras', tipo: 'valor', valorAtual: -8400, valorAnterior: -7200, nivel: 1 },
  { conta: 'LAIR', tipo: 'subtotal', valorAtual: 61500, valorAnterior: 52300, nivel: 0 },
  { conta: 'IRPJ e CSLL', tipo: 'valor', valorAtual: -13530, valorAnterior: -11506, nivel: 1 },
  { conta: 'LUCRO LÍQUIDO DO EXERCÍCIO', tipo: 'resultado', valorAtual: 47970, valorAnterior: 40794, nivel: 0 },
];

const receitaLiquida = 292400;

const barData = [
  { name: 'Rec. Líquida', atual: 292400, anterior: 257400 },
  { name: 'Lucro Bruto', atual: 165900, anterior: 146100 },
  { name: 'EBITDA', atual: 66700, anterior: 56700 },
  { name: 'Lucro Líq.', atual: 47970, anterior: 40794 },
];

export default function DREPage() {
  const { selectedCompany } = useCompany();
  const [periodoAtual, setPeriodoAtual] = useState('2026-03');
  const [periodoAnterior, setPeriodoAnterior] = useState('2026-02');

  const fmt = (v: number | null, showPct = false) => {
    if (v === null) return '';
    const formatted = Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pct = receitaLiquida > 0 ? ((v / receitaLiquida) * 100).toFixed(1) + '%' : '';
    if (showPct) return pct;
    return (v < 0 ? '-' : '') + formatted;
  };

  const delta = (atual: number | null, anterior: number | null) => {
    if (!atual || !anterior || anterior === 0) return null;
    return ((atual - anterior) / Math.abs(anterior)) * 100;
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver o DRE.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">DRE — Demonstração do Resultado</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-sm border border-[#1e2740]"><Printer className="h-4 w-4" /> Imprimir</button>
          <button className="btn-ghost text-sm border border-[#1e2740]"><Download className="h-4 w-4" /> Exportar</button>
        </div>
      </div>

      {/* Period selectors */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Período Atual</label>
          <input type="month" value={periodoAtual} onChange={e => setPeriodoAtual(e.target.value)}
            className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Período Comparativo</label>
          <input type="month" value={periodoAnterior} onChange={e => setPeriodoAnterior(e.target.value)}
            className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* DRE Table */}
        <div className="xl:col-span-2 card-aura overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                <th className="pb-3 font-medium w-2/5">Conta</th>
                <th className="pb-3 font-medium text-right">Mar/2026</th>
                <th className="pb-3 font-medium text-right">% Rec.</th>
                <th className="pb-3 font-medium text-right">Fev/2026</th>
                <th className="pb-3 font-medium text-right">Var %</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DRE.map((linha, i) => {
                const d = delta(linha.valorAtual, linha.valorAnterior);
                const isTitulo = linha.tipo === 'titulo';
                const isSubtotal = linha.tipo === 'subtotal';
                const isResultado = linha.tipo === 'resultado';
                return (
                  <tr key={i} className={`border-b border-[#1e2740]/50 ${isTitulo ? 'bg-[#1e2740]/30' : isResultado ? 'bg-indigo-600/10' : ''}`}>
                    <td className={`py-2.5 text-sm ${linha.nivel === 1 ? 'pl-6' : ''} ${isTitulo ? 'text-gray-500 font-medium text-xs uppercase tracking-wide' : isSubtotal ? 'text-white font-semibold' : isResultado ? 'text-indigo-300 font-bold' : 'text-gray-300'}`}>
                      {linha.conta}
                    </td>
                    <td className={`py-2.5 text-sm text-right font-mono ${isResultado ? 'text-indigo-300 font-bold' : isSubtotal ? 'text-white font-semibold' : linha.valorAtual && linha.valorAtual < 0 ? 'text-red-400' : 'text-gray-200'}`}>
                      {fmt(linha.valorAtual)}
                    </td>
                    <td className="py-2.5 text-xs text-right text-gray-500 font-mono">
                      {linha.valorAtual ? fmt(linha.valorAtual, true) : ''}
                    </td>
                    <td className={`py-2.5 text-sm text-right font-mono text-gray-500`}>
                      {fmt(linha.valorAnterior)}
                    </td>
                    <td className="py-2.5 text-xs text-right font-mono">
                      {d !== null ? (
                        <span className={`flex items-center justify-end gap-1 ${d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {d >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(d).toFixed(1)}%
                        </span>
                      ) : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Chart + AI */}
        <div className="space-y-4">
          <div className="card-aura">
            <h3 className="text-sm font-semibold text-white mb-4">Comparativo por Indicador</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} contentStyle={{ background: '#161b2e', border: '1px solid #1e2740', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Bar dataKey="atual" name="Atual" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="anterior" name="Anterior" fill="#374151" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-aura">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-indigo-400" />
              Análise IA
            </h3>
            <div className="text-sm text-gray-300 space-y-2 leading-relaxed">
              <p>A empresa apresentou crescimento de <span className="text-green-400 font-medium">17,6%</span> no lucro líquido em relação ao mês anterior, puxado pelo aumento de 12,9% na receita de serviços.</p>
              <p>A margem EBITDA melhorou de <span className="text-blue-400">22,0%</span> para <span className="text-green-400">22,8%</span>, indicando maior eficiência operacional.</p>
              <p className="text-yellow-300">Atenção: despesas financeiras cresceram 16,7% — avaliar renegociação de dívidas.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
