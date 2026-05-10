'use client';
import { useState } from 'react';
import { Users, Plus, Search, Edit2, UserX, X, Check } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface Colaborador {
  id: string;
  nome: string;
  cpf: string;
  cargo: string;
  departamento: string;
  admissao: string;
  salario: number;
  status: 'ativo' | 'inativo';
  ctps?: string;
  pis?: string;
  dependentes: number;
  banco?: string;
  agencia?: string;
  conta?: string;
}

const MOCK_COLABORADORES: Colaborador[] = [
  { id: '1', nome: 'Ana Paula Ferreira', cpf: '234.567.890-12', cargo: 'Gerente Contábil', departamento: 'Contabilidade', admissao: '2019-03-01', salario: 8500, status: 'ativo', ctps: '123456/001-SP', pis: '180.72456.34-7', dependentes: 2, banco: 'Itaú', agencia: '0234', conta: '12345-6' },
  { id: '2', nome: 'Carlos Eduardo Silva', cpf: '345.678.901-23', cargo: 'Analista Fiscal', departamento: 'Fiscal', admissao: '2020-07-15', salario: 5800, status: 'ativo', ctps: '234567/002-SP', pis: '180.89234.12-9', dependentes: 1, banco: 'Bradesco', agencia: '1234', conta: '23456-7' },
  { id: '3', nome: 'Maria Fernanda Costa', cpf: '456.789.012-34', cargo: 'Assistente Contábil', departamento: 'Contabilidade', admissao: '2022-01-10', salario: 3200, status: 'ativo', ctps: '345678/003-SP', pis: '180.12345.67-8', dependentes: 0, banco: 'Nubank', agencia: '0001', conta: '34567-8' },
  { id: '4', nome: 'João Ricardo Alves', cpf: '567.890.123-45', cargo: 'Desenvolvedor', departamento: 'TI', admissao: '2021-05-03', salario: 7200, status: 'ativo', ctps: '456789/004-SP', pis: '180.23456.78-9', dependentes: 3, banco: 'Santander', agencia: '2345', conta: '45678-9' },
  { id: '5', nome: 'Patrícia Lima Santos', cpf: '678.901.234-56', cargo: 'RH Generalist', departamento: 'RH', admissao: '2020-11-20', salario: 4600, status: 'ativo', ctps: '567890/005-SP', pis: '180.34567.89-0', dependentes: 0, banco: 'Caixa', agencia: '3456', conta: '56789-0' },
  { id: '6', nome: 'Roberto Mendes Jr.', cpf: '789.012.345-67', cargo: 'Contador', departamento: 'Contabilidade', admissao: '2018-08-12', salario: 6200, status: 'inativo', ctps: '678901/006-SP', pis: '180.45678.90-1', dependentes: 2, banco: 'BB', agencia: '4567', conta: '67890-1' },
];

const emptyForm = {
  nome: '', cpf: '', ctps: '', pis: '', cargo: '', departamento: '', admissao: '',
  salario: '', dependentes: '0', banco: '', agencia: '', conta: '',
};

export default function ColaboradoresPage() {
  const { selectedCompany } = useCompany();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>(MOCK_COLABORADORES);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = colaboradores.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf.includes(search) ||
    c.cargo.toLowerCase().includes(search.toLowerCase()) ||
    c.departamento.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (c: Colaborador) => {
    setForm({ nome: c.nome, cpf: c.cpf, ctps: c.ctps || '', pis: c.pis || '', cargo: c.cargo, departamento: c.departamento, admissao: c.admissao, salario: String(c.salario), dependentes: String(c.dependentes), banco: c.banco || '', agencia: c.agencia || '', conta: c.conta || '' });
    setEditId(c.id);
    setShowModal(true);
  };

  const saveForm = () => {
    if (!form.nome || !form.cpf) return;
    if (editId) {
      setColaboradores(prev => prev.map(c => c.id === editId ? { ...c, ...form, salario: parseFloat(form.salario) || 0, dependentes: parseInt(form.dependentes) || 0 } : c));
    } else {
      const novo: Colaborador = {
        id: crypto.randomUUID(), nome: form.nome, cpf: form.cpf, ctps: form.ctps, pis: form.pis,
        cargo: form.cargo, departamento: form.departamento, admissao: form.admissao,
        salario: parseFloat(form.salario) || 0, dependentes: parseInt(form.dependentes) || 0,
        banco: form.banco, agencia: form.agencia, conta: form.conta, status: 'ativo',
      };
      setColaboradores(prev => [novo, ...prev]);
    }
    setShowModal(false);
  };

  const toggleStatus = (id: string) => {
    setColaboradores(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'ativo' ? 'inativo' : 'ativo' } : c));
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para gerenciar colaboradores.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestão de Colaboradores</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · {colaboradores.filter(c => c.status === 'ativo').length} ativos</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/folha" className="btn-ghost text-sm border border-[#1e2740]">← Folha de Pagamento</Link>
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, cargo ou departamento..."
          className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 placeholder-gray-600"
        />
      </div>

      {/* Table */}
      <div className="card-aura overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
              <th className="pb-3 font-medium">Nome</th>
              <th className="pb-3 font-medium">CPF</th>
              <th className="pb-3 font-medium">Cargo</th>
              <th className="pb-3 font-medium">Departamento</th>
              <th className="pb-3 font-medium">Admissão</th>
              <th className="pb-3 font-medium text-right">Salário</th>
              <th className="pb-3 font-medium text-center">Status</th>
              <th className="pb-3 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2740]">
            {filtered.map(c => (
              <tr key={c.id} className={`hover:bg-white/5 transition-colors ${c.status === 'inativo' ? 'opacity-50' : ''}`}>
                <td className="py-3">
                  <p className="text-white text-sm font-medium">{c.nome}</p>
                  <p className="text-gray-500 text-xs">{c.pis || '—'}</p>
                </td>
                <td className="py-3 text-sm text-gray-400 font-mono">{c.cpf}</td>
                <td className="py-3 text-sm text-white">{c.cargo}</td>
                <td className="py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400">{c.departamento}</span>
                </td>
                <td className="py-3 text-sm text-gray-400">{new Date(c.admissao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="py-3 text-sm text-right font-mono text-white">{c.salario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'ativo' ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'}`}>
                    {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openEdit(c)} className="btn-ghost p-1.5 text-gray-400 hover:text-white" title="Editar">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleStatus(c.id)} className={`btn-ghost p-1.5 ${c.status === 'ativo' ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`} title={c.status === 'ativo' ? 'Desativar' : 'Reativar'}>
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">{editId ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">Nome Completo *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="João da Silva" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">CPF *</label>
                <input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">CTPS</label>
                <input value={form.ctps} onChange={e => setForm(f => ({ ...f, ctps: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="000000/001-SP" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">PIS/PASEP</label>
                <input value={form.pis} onChange={e => setForm(f => ({ ...f, pis: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="000.00000.00-0" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Cargo</label>
                <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="Analista Contábil" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Departamento</label>
                <input value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="Contabilidade" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Data de Admissão</label>
                <input type="date" value={form.admissao} onChange={e => setForm(f => ({ ...f, admissao: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Salário Base (R$)</label>
                <input type="number" value={form.salario} onChange={e => setForm(f => ({ ...f, salario: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="3000.00" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Dependentes</label>
                <input type="number" min="0" value={form.dependentes} onChange={e => setForm(f => ({ ...f, dependentes: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2 border-t border-[#1e2740] pt-3">
                <p className="text-sm text-gray-400 font-medium mb-3">Dados Bancários</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Banco</label>
                <input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="Itaú" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Agência</label>
                <input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="0001" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Conta</label>
                <input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder="12345-6" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={saveForm} className="btn-primary flex-1">
                <Check className="h-4 w-4" />
                {editId ? 'Salvar Alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
