'use client';
import { useState } from 'react';
import { Users, DollarSign, CheckCircle, Clock, ChevronLeft, ChevronRight, FileText, AlertTriangle } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

type FolhaStatus = 'rascunho' | 'aprovada' | 'paga';

interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  departamento: string;
  salarioBruto: number;
  inss: number;
  irrf: number;
  fgts: number;
  salarioLiquido: number;
  status: 'ativo' | 'afastado';
  holerite: 'pendente' | 'gerado' | 'aprovado';
}

const MOCK_FUNCIONARIOS: Funcionario[] = [
  { id: '1', nome: 'Ana Paula Ferreira', cargo: 'Gerente Contábil', departamento: 'Contabilidade', salarioBruto: 8500, inss: 935, irrf: 892.07, fgts: 680, salarioLiquido: 6672.93, status: 'ativo', holerite: 'aprovado' },
  { id: '2', nome: 'Carlos Eduardo Silva', cargo: 'Analista Fiscal', departamento: 'Fiscal', salarioBruto: 5800, inss: 638, irrf: 401.24, fgts: 464, salarioLiquido: 4760.76, status: 'ativo', holerite: 'aprovado' },
  { id: '3', nome: 'Maria Fernanda Costa', cargo: 'Assistente Contábil', departamento: 'Contabilidade', salarioBruto: 3200, inss: 316, irrf: 0, fgts: 256, salarioLiquido: 2884, status: 'ativo', holerite: 'gerado' },
  { id: '4', nome: 'João Ricardo Alves', cargo: 'Desenvolvedor', departamento: 'TI', salarioBruto: 7200, inss: 792, irrf: 624.80, fgts: 576, salarioLiquido: 5783.20, status: 'ativo', holerite: 'gerado' },
  { id: '5', nome: 'Patrícia Lima Santos', cargo: 'RH Generalist', departamento: 'RH', salarioBruto: 4600, inss: 506, irrf: 178.92, fgts: 368, salarioLiquido: 3915.08, status: 'ativo', holerite: 'pendente' },
  { id: '6', nome: 'Roberto Mendes Jr.', cargo: 'Contador', departamento: 'Contabilidade', salarioBruto: 6200, inss: 682, irrf: 487.55, fgts: 496, salarioLiquido: 5030.45, status: 'afastado', holerite: 'pendente' },
];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const statusFolhaConfig: Record<FolhaStatus, { label: string; color: string; bg: string; border: string }> = {
  rascunho: { label: 'Rascunho', color: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/30' },
  aprovada: { label: 'Aprovada', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
  paga: { label: 'Paga', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
};

const holleriteConfig = {
  pendente: { color: 'text-yellow-400', label: 'Pendente' },
  gerado: { color: 'text-blue-400', label: 'Gerado' },
  aprovado: { color: 'text-green-400', label: 'Aprovado' },
};

export default function FolhaPage() {
  const { selectedCompany } = useCompany();
  const [mes, setMes] = useState(2);
  const [ano, setAno] = useState(2026);
  const [folhaStatus, setFolhaStatus] = useState<FolhaStatus>('rascunho');
  const [showAprovar, setShowAprovar] = useState(false);

  const funcionarios = MOCK_FUNCIONARIOS;
  const totalBruto = funcionarios.filter(f => f.status === 'ativo').reduce((s, f) => s + f.salarioBruto, 0);
  const totalInss = funcionarios.filter(f => f.status === 'ativo').reduce((s, f) => s + f.inss, 0);
  const totalFgts = funcionarios.filter(f => f.status === 'ativo').reduce((s, f) => s + f.fgts, 0);
  const totalLiquido = funcionarios.filter(f => f.status === 'ativo').reduce((s, f) => s + f.salarioLiquido, 0);
  const totalFuncionarios = funcionarios.filter(f => f.status === 'ativo').length;

  const cfg = statusFolhaConfig[folhaStatus];

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver a folha de pagamento.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Folha de Pagamento</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs px-3 py-1 rounded-full border font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
          {folhaStatus === 'rascunho' && (
            <button className="btn-ghost text-sm border border-[#1e2740]">
              <FileText className="h-4 w-4" />
              Gerar Folha
            </button>
          )}
          {folhaStatus !== 'paga' && (
            <button onClick={() => setShowAprovar(true)} className="btn-primary text-sm">
              <CheckCircle className="h-4 w-4" />
              {folhaStatus === 'rascunho' ? 'Aprovar Folha' : 'Marcar como Paga'}
            </button>
          )}
          <Link href={`/folha/${ano}-${String(mes + 1).padStart(2, '0')}`} className="btn-ghost text-sm border border-[#1e2740]">
            Ver Detalhes
          </Link>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }}
          className="btn-ghost p-1.5"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-white font-medium min-w-[140px] text-center">{MESES[mes]} {ano}</span>
        <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }}
          className="btn-ghost p-1.5"><ChevronRight className="h-4 w-4" /></button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-indigo-400" />
            <p className="text-xs text-gray-500">Funcionários</p>
          </div>
          <p className="text-2xl font-bold text-white">{totalFuncionarios}</p>
          <p className="text-xs text-gray-500 mt-1">{funcionarios.filter(f => f.status === 'afastado').length} afastados</p>
        </div>
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-blue-400" />
            <p className="text-xs text-gray-500">Total Bruto</p>
          </div>
          <p className="text-xl font-bold text-white">{totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-orange-400" />
            <p className="text-xs text-gray-500">Total INSS</p>
          </div>
          <p className="text-xl font-bold text-white">{totalInss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-purple-400" />
            <p className="text-xs text-gray-500">Total FGTS</p>
          </div>
          <p className="text-xl font-bold text-white">{totalFgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
        <div className="card-aura">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            <p className="text-xs text-gray-500">Total Líquido</p>
          </div>
          <p className="text-xl font-bold text-green-400">{totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      {/* Employee list */}
      <div className="card-aura">
        <h2 className="text-lg font-semibold text-white mb-4">Holerites — {MESES[mes]} {ano}</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
              <th className="pb-3 font-medium">Funcionário</th>
              <th className="pb-3 font-medium text-right">Bruto</th>
              <th className="pb-3 font-medium text-right">INSS</th>
              <th className="pb-3 font-medium text-right">IRRF</th>
              <th className="pb-3 font-medium text-right">FGTS</th>
              <th className="pb-3 font-medium text-right">Líquido</th>
              <th className="pb-3 font-medium text-center">Status</th>
              <th className="pb-3 font-medium text-center">Holerite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2740]">
            {funcionarios.map(f => {
              const hCfg = holleriteConfig[f.holerite];
              return (
                <tr key={f.id} className={`hover:bg-white/5 transition-colors ${f.status === 'afastado' ? 'opacity-50' : ''}`}>
                  <td className="py-3">
                    <p className="text-white text-sm font-medium">{f.nome}</p>
                    <p className="text-gray-500 text-xs">{f.cargo} · {f.departamento}</p>
                  </td>
                  <td className="py-3 text-sm text-right font-mono text-white">{f.salarioBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-orange-400">{f.inss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-red-400">{f.irrf.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-purple-400">{f.fgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-green-400 font-semibold">{f.salarioLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === 'ativo' ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'}`}>
                      {f.status === 'ativo' ? 'Ativo' : 'Afastado'}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`text-xs font-medium ${hCfg.color}`}>{hCfg.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Aprovar Modal */}
      {showAprovar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-8 w-full max-w-md space-y-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-semibold text-white">Confirmar Aprovação</h2>
                <p className="text-gray-400 text-sm mt-1">Ao aprovar a folha de {MESES[mes]} {ano}, os holerites serão enviados para os funcionários e os encargos calculados.</p>
              </div>
            </div>
            <div className="bg-[#161b2e] rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Total Bruto:</span><span className="text-white font-mono">{totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Total Líquido:</span><span className="text-green-400 font-mono">{totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">FGTS a recolher:</span><span className="text-purple-400 font-mono">{totalFgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAprovar(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={() => { setFolhaStatus(folhaStatus === 'rascunho' ? 'aprovada' : 'paga'); setShowAprovar(false); }} className="btn-primary flex-1">
                <CheckCircle className="h-4 w-4" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
