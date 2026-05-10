'use client';
import { useState } from 'react';
import { Download, CheckCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface ContaBalanco {
  id: string;
  conta: string;
  valor: number;
  filhos?: ContaBalanco[];
  nivel: number;
}

const ATIVO: ContaBalanco[] = [
  { id: 'ac', conta: 'ATIVO CIRCULANTE', valor: 387420, nivel: 0, filhos: [
    { id: 'ac1', conta: 'Caixa e Equivalentes de Caixa', valor: 142800, nivel: 1 },
    { id: 'ac2', conta: 'Contas a Receber', valor: 189300, nivel: 1, filhos: [
      { id: 'ac2a', conta: 'Clientes Nacionais', valor: 172400, nivel: 2 },
      { id: 'ac2b', conta: 'Provisão p/ Devedores Duvidosos', valor: -18900, nivel: 2 },
      { id: 'ac2c', conta: 'Clientes do Exterior', valor: 35800, nivel: 2 },
    ]},
    { id: 'ac3', conta: 'Estoques', valor: 34200, nivel: 1 },
    { id: 'ac4', conta: 'Impostos a Recuperar', valor: 21120, nivel: 1 },
  ]},
  { id: 'anc', conta: 'ATIVO NÃO CIRCULANTE', valor: 298600, nivel: 0, filhos: [
    { id: 'anc1', conta: 'Realizável a Longo Prazo', valor: 45000, nivel: 1 },
    { id: 'anc2', conta: 'Imobilizado', valor: 312400, nivel: 1, filhos: [
      { id: 'anc2a', conta: 'Equipamentos', valor: 185000, nivel: 2 },
      { id: 'anc2b', conta: 'Veículos', valor: 98000, nivel: 2 },
      { id: 'anc2c', conta: 'Depreciação Acumulada', valor: -62600, nivel: 2 },
    ]},
    { id: 'anc3', conta: 'Intangível', valor: 28400, nivel: 1 },
    { id: 'anc4', conta: 'Amortização Acumulada', valor: -87200, nivel: 1 },
  ]},
];

const PASSIVO: ContaBalanco[] = [
  { id: 'pc', conta: 'PASSIVO CIRCULANTE', valor: 198340, nivel: 0, filhos: [
    { id: 'pc1', conta: 'Fornecedores', valor: 87600, nivel: 1 },
    { id: 'pc2', conta: 'Obrigações Trabalhistas', valor: 42300, nivel: 1 },
    { id: 'pc3', conta: 'Obrigações Fiscais', valor: 31840, nivel: 1 },
    { id: 'pc4', conta: 'Empréstimos e Financiamentos CP', valor: 36600, nivel: 1 },
  ]},
  { id: 'pnc', conta: 'PASSIVO NÃO CIRCULANTE', valor: 187680, nivel: 0, filhos: [
    { id: 'pnc1', conta: 'Empréstimos e Financiamentos LP', valor: 165000, nivel: 1 },
    { id: 'pnc2', conta: 'Provisões de Longo Prazo', valor: 22680, nivel: 1 },
  ]},
  { id: 'pl', conta: 'PATRIMÔNIO LÍQUIDO', valor: 300000, nivel: 0, filhos: [
    { id: 'pl1', conta: 'Capital Social', valor: 200000, nivel: 1 },
    { id: 'pl2', conta: 'Reservas de Lucros', valor: 52030, nivel: 1 },
    { id: 'pl3', conta: 'Lucros Acumulados', valor: 47970, nivel: 1 },
  ]},
];

function calcTotal(contas: ContaBalanco[]): number {
  return contas.reduce((s, c) => s + c.valor, 0);
}

function ContaRow({ conta, expanded, toggle }: { conta: ContaBalanco; expanded: Set<string>; toggle: (id: string) => void }) {
  const isExpanded = expanded.has(conta.id);
  const hasChildren = conta.filhos && conta.filhos.length > 0;
  const isNeg = conta.valor < 0;

  return (
    <>
      <tr className={`border-b border-[#1e2740]/40 hover:bg-white/5 ${conta.nivel === 0 ? 'bg-[#1e2740]/20' : ''}`}>
        <td className={`py-2 text-sm ${conta.nivel === 0 ? 'pl-2' : conta.nivel === 1 ? 'pl-6' : 'pl-10'}`}>
          <button
            onClick={() => hasChildren && toggle(conta.id)}
            className={`flex items-center gap-1 text-left w-full ${conta.nivel === 0 ? 'text-white font-semibold text-xs uppercase tracking-wide' : conta.nivel === 1 ? 'text-gray-200' : 'text-gray-400'}`}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />) : <span className="w-3" />}
            {conta.conta}
          </button>
        </td>
        <td className={`py-2 text-sm text-right font-mono pr-2 ${conta.nivel === 0 ? 'text-white font-bold' : isNeg ? 'text-red-400' : 'text-gray-200'}`}>
          {conta.valor !== 0 ? conta.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
        </td>
      </tr>
      {isExpanded && conta.filhos?.map(f => (
        <ContaRow key={f.id} conta={f} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export default function BalancoPage() {
  const { selectedCompany } = useCompany();
  const [data, setData] = useState('2026-03-31');
  const [expandedAtivo, setExpandedAtivo] = useState<Set<string>>(new Set(['ac', 'anc']));
  const [expandedPassivo, setExpandedPassivo] = useState<Set<string>>(new Set(['pc', 'pnc', 'pl']));

  const toggleAtivo = (id: string) => setExpandedAtivo(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const togglePassivo = (id: string) => setExpandedPassivo(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const totalAtivo = calcTotal(ATIVO);
  const totalPassivo = calcTotal(PASSIVO);
  const balanced = Math.abs(totalAtivo - totalPassivo) < 1;

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver o Balanço Patrimonial.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Balanço Patrimonial</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {balanced ? (
            <span className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/30 px-3 py-1.5 rounded-lg">
              <CheckCircle className="h-4 w-4" /> Ativo = Passivo + PL
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/30 px-3 py-1.5 rounded-lg">
              ⚠ Desequilíbrio detectado
            </span>
          )}
          <button className="btn-ghost text-sm border border-[#1e2740]"><Download className="h-4 w-4" /> Exportar</button>
        </div>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Data-base:</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)}
          className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-indigo-500" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ativo */}
        <div className="card-aura">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">ATIVO</h2>
            <span className="text-xl font-bold text-indigo-400 font-mono">
              {totalAtivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {ATIVO.map(c => <ContaRow key={c.id} conta={c} expanded={expandedAtivo} toggle={toggleAtivo} />)}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-indigo-500/50">
                <td className="pt-3 text-sm font-bold text-white uppercase">Total do Ativo</td>
                <td className="pt-3 text-sm font-bold text-indigo-400 text-right font-mono">
                  {totalAtivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Passivo + PL */}
        <div className="card-aura">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">PASSIVO + PL</h2>
            <span className="text-xl font-bold text-green-400 font-mono">
              {totalPassivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {PASSIVO.map(c => <ContaRow key={c.id} conta={c} expanded={expandedPassivo} toggle={togglePassivo} />)}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-green-500/50">
                <td className="pt-3 text-sm font-bold text-white uppercase">Total Passivo + PL</td>
                <td className="pt-3 text-sm font-bold text-green-400 text-right font-mono">
                  {totalPassivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
