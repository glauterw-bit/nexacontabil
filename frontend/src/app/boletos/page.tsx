'use client';
import { useState } from 'react';
import { Plus, Download, CheckCircle, Search, Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

type BoletoStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado';

interface Boleto {
  id: string;
  pagador: string;
  cnpjCpf: string;
  valor: number;
  vencimento: string;
  status: BoletoStatus;
  codigoBarras: string;
  linhaDigitavel: string;
  descricao?: string;
}

const MOCK_BOLETOS: Boleto[] = [
  { id: '1', pagador: 'Empresa ABC Ltda', cnpjCpf: '12.345.678/0001-90', valor: 5800.00, vencimento: '2026-03-30', status: 'pendente', codigoBarras: '34191.09008 12345.678901 23456.789012 1 98760000058000', linhaDigitavel: '34191090081234567890123456789012198760000058000', descricao: 'Honorários Contábeis — Mar/2026' },
  { id: '2', pagador: 'Comércio XYZ SA', cnpjCpf: '98.765.432/0001-10', valor: 3200.00, vencimento: '2026-03-25', status: 'pago', codigoBarras: '34191.09008 98765.432001 10234.567890 2 87650000032000', linhaDigitavel: '34191090089876543200110234567890287650000032000', descricao: 'Assessoria Fiscal — Fev/2026' },
  { id: '3', pagador: 'Maria Santos ME', cnpjCpf: '111.222.333-44', valor: 1200.00, vencimento: '2026-03-10', status: 'vencido', codigoBarras: '34191.09008 11122.233344 12345.678901 3 76540000012000', linhaDigitavel: '34191090081112223334412345678901376540000012000', descricao: 'Declaração Anual IR' },
  { id: '4', pagador: 'Tech Solutions Ltda', cnpjCpf: '22.333.444/0001-55', valor: 9500.00, vencimento: '2026-04-05', status: 'pendente', codigoBarras: '34191.09008 22333.444001 55123.456789 4 65430000095000', linhaDigitavel: '34191090082233344400155123456789465430000095000', descricao: 'Contabilidade Mensal — Abr/2026' },
  { id: '5', pagador: 'João da Silva', cnpjCpf: '987.654.321-00', valor: 480.00, vencimento: '2026-03-01', status: 'cancelado', codigoBarras: '34191.09008 98765.432100 01234.567890 5 54320000004800', linhaDigitavel: '34191090089876543210001234567890554320000004800', descricao: 'Consulta Tributária' },
];

const statusConfig: Record<BoletoStatus, { label: string; color: string; bg: string; border: string }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' },
  pago: { label: 'Pago', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
  vencido: { label: 'Vencido', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30' },
  cancelado: { label: 'Cancelado', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/30' },
};

export default function BoletosPage() {
  const { selectedCompany } = useCompany();
  const [boletos, setBoletos] = useState<Boleto[]>(MOCK_BOLETOS);
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [showBarcode, setShowBarcode] = useState<string | null>(null);

  const marcarPago = (id: string) => {
    setBoletos(prev => prev.map(b => b.id === id ? { ...b, status: 'pago' as BoletoStatus } : b));
  };

  const filtered = boletos.filter(b => {
    const matchSearch = b.pagador.toLowerCase().includes(search.toLowerCase()) || b.cnpjCpf.includes(search);
    const matchStatus = statusFiltro === 'todos' || b.status === statusFiltro;
    return matchSearch && matchStatus;
  });

  const selectedBoleto = boletos.find(b => b.id === showBarcode);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para gerenciar boletos.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  const totalPendente = boletos.filter(b => b.status === 'pendente').reduce((s, b) => s + b.valor, 0);
  const totalVencido = boletos.filter(b => b.status === 'vencido').reduce((s, b) => s + b.valor, 0);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Boletos</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <Link href="/boletos/novo" className="btn-primary">
          <Plus className="h-4 w-4" /> Novo Boleto
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">A receber (pendentes)</p>
          <p className="text-xl font-bold text-yellow-400">{totalPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{boletos.filter(b => b.status === 'pendente').length} boletos</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Vencidos</p>
          <p className="text-xl font-bold text-red-400">{totalVencido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{boletos.filter(b => b.status === 'vencido').length} boletos</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Pagos este mês</p>
          <p className="text-xl font-bold text-green-400">{boletos.filter(b => b.status === 'pago').reduce((s, b) => s + b.valor, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{boletos.filter(b => b.status === 'pago').length} boletos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pagador ou CNPJ/CPF..."
            className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg pl-10 pr-4 py-2 text-white text-sm outline-none focus:border-indigo-500 placeholder-gray-600" />
        </div>
        <div className="flex rounded-lg border border-[#1e2740] overflow-hidden">
          {(['todos', 'pendente', 'pago', 'vencido', 'cancelado'] as const).map(s => (
            <button key={s} onClick={() => setStatusFiltro(s)}
              className={`px-3 py-1.5 text-sm transition-colors capitalize ${statusFiltro === s ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {s === 'todos' ? 'Todos' : statusConfig[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card-aura overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
              <th className="pb-3 font-medium">Pagador</th>
              <th className="pb-3 font-medium">Descrição</th>
              <th className="pb-3 font-medium text-right">Valor</th>
              <th className="pb-3 font-medium">Vencimento</th>
              <th className="pb-3 font-medium text-center">Status</th>
              <th className="pb-3 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2740]">
            {filtered.map(b => {
              const cfg = statusConfig[b.status];
              const isVencido = b.status === 'vencido';
              return (
                <tr key={b.id} className={`hover:bg-white/5 transition-colors ${b.status === 'cancelado' ? 'opacity-40' : ''}`}>
                  <td className="py-3">
                    <p className="text-white text-sm font-medium">{b.pagador}</p>
                    <p className="text-gray-500 text-xs font-mono">{b.cnpjCpf}</p>
                  </td>
                  <td className="py-3 text-sm text-gray-400 max-w-[200px] truncate">{b.descricao}</td>
                  <td className="py-3 text-sm text-right font-mono font-semibold text-white">{b.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className={`py-3 text-sm ${isVencido ? 'text-red-400' : 'text-gray-400'}`}>
                    {new Date(b.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setShowBarcode(b.id)} className="btn-ghost p-1.5 text-gray-400 hover:text-white" title="Código de Barras">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-white" title="Download PDF">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {(b.status === 'pendente' || b.status === 'vencido') && (
                        <button onClick={() => marcarPago(b.id)} className="btn-ghost p-1.5 text-green-400 hover:text-green-300" title="Marcar como pago">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Barcode Modal */}
      {showBarcode && selectedBoleto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-semibold text-white">Código de Barras</h2>
            <div className="bg-white rounded-lg p-4">
              <div className="flex gap-0.5 items-end justify-center h-16 mb-3">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="bg-black" style={{ width: Math.random() > 0.5 ? 2 : 1, height: Math.random() > 0.3 ? 64 : 48 }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Linha Digitável</p>
              <p className="text-sm font-mono text-white bg-[#161b2e] p-3 rounded-lg break-all">{selectedBoleto.linhaDigitavel}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-gray-500 text-xs">Pagador</p><p className="text-white">{selectedBoleto.pagador}</p></div>
              <div><p className="text-gray-500 text-xs">Valor</p><p className="text-green-400 font-bold">{selectedBoleto.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
              <div><p className="text-gray-500 text-xs">Vencimento</p><p className="text-white">{new Date(selectedBoleto.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div>
              <div><p className="text-gray-500 text-xs">Status</p><p className={statusConfig[selectedBoleto.status].color}>{statusConfig[selectedBoleto.status].label}</p></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowBarcode(null)} className="btn-ghost flex-1">Fechar</button>
              <button className="btn-primary flex-1"><Download className="h-4 w-4" />Baixar PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
