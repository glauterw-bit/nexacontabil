'use client';
import { useState } from 'react';
import { Users, Plus, Search, Edit2, UserX, X, Check, Loader2, Building2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const EMPLOYEES_QUERY = gql`
  query Employees($companyId: String!) {
    employees(companyId: $companyId) {
      id name cpf ctps pis role department admissionDate
      baseSalary dependents bank bankAgency bankAccount active
    }
  }
`;

const CREATE_EMPLOYEE = gql`
  mutation CreateEmployee($input: CreateEmployeeInput!) {
    createEmployee(input: $input) {
      id name cpf role department admissionDate baseSalary active
    }
  }
`;

interface Employee {
  id: string;
  name: string;
  cpf: string;
  ctps?: string | null;
  pis?: string | null;
  role: string;
  department?: string | null;
  admissionDate: string;
  baseSalary: number;
  dependents: number;
  bank?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  active: boolean;
}

const emptyForm = {
  name: '', cpf: '', ctps: '', pis: '', role: '', department: '', admissionDate: '',
  baseSalary: '', dependents: '0', bank: '', bankAgency: '', bankAccount: '',
};

export default function ColaboradoresPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const { data, loading, refetch } = useQuery(EMPLOYEES_QUERY, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
    fetchPolicy: 'cache-and-network',
  });
  const [createEmployee, { loading: creating }] = useMutation(CREATE_EMPLOYEE, {
    onCompleted: () => { toast.push('Colaborador cadastrado', { variant: 'success' }); refetch(); setShowModal(false); },
    onError: (e) => toast.push(e.message, { variant: 'error' }),
  });

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const employees: Employee[] = data?.employees ?? [];

  const filtered = employees.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.cpf.includes(search) ||
    c.role.toLowerCase().includes(search.toLowerCase()) ||
    (c.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setForm(emptyForm);
    setShowModal(true);
  };

  const saveForm = async () => {
    if (!form.name || !form.cpf || !form.admissionDate || !selectedCompany) return;
    await createEmployee({
      variables: {
        input: {
          companyId: selectedCompany.id,
          name: form.name,
          cpf: form.cpf,
          ctps: form.ctps || null,
          pis: form.pis || null,
          role: form.role || 'Colaborador',
          department: form.department || null,
          admissionDate: new Date(form.admissionDate + 'T12:00:00').toISOString(),
          baseSalary: parseFloat(form.baseSalary) || 0,
          dependents: parseInt(form.dependents) || 0,
          bank: form.bank || null,
          bankAgency: form.bankAgency || null,
          bankAccount: form.bankAccount || null,
        },
      },
    });
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-tx-faint" />
        <p className="text-tx-muted text-sm">Selecione uma empresa para gerenciar colaboradores.</p>
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-tx-strong flex items-center gap-2">
            <Users className="h-6 w-6 text-acao" />
            Gestão de Colaboradores
          </h1>
          <p className="text-tx-muted text-sm mt-1">{selectedCompany.name} · {employees.filter(c => c.active).length} ativos</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/folha" className="btn-ghost text-sm border border-line">← Folha de Pagamento</Link>
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, cargo ou departamento..."
          className="w-full bg-card border border-line rounded-lg pl-10 pr-4 py-2.5 text-tx-strong text-sm outline-none focus:border-indigo-500 placeholder:text-tx-faint"
        />
      </div>

      {loading && employees.length === 0 ? (
        <div className="text-center py-20 text-sm text-tx-muted flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando colaboradores…
        </div>
      ) : employees.length === 0 ? (
        <div className="card-aura p-12 text-center">
          <Users className="h-12 w-12 text-tx-faint mx-auto mb-3" />
          <p className="text-tx-muted text-sm">Nenhum colaborador cadastrado ainda.</p>
          <button onClick={openNew} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Cadastrar primeiro
          </button>
        </div>
      ) : (
        <div className="card-aura overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-tx-muted border-b border-line">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium">CPF</th>
                <th className="pb-3 font-medium">Cargo</th>
                <th className="pb-3 font-medium">Departamento</th>
                <th className="pb-3 font-medium">Admissão</th>
                <th className="pb-3 font-medium text-right">Salário</th>
                <th className="pb-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map(c => (
                <tr key={c.id} className={`hover:bg-inset transition-colors ${!c.active ? 'opacity-50' : ''}`}>
                  <td className="py-3">
                    <p className="text-tx-strong text-sm font-medium">{c.name}</p>
                    <p className="text-tx-muted text-xs">{c.pis || '—'}</p>
                  </td>
                  <td className="py-3 text-sm text-tx-muted font-mono">{c.cpf}</td>
                  <td className="py-3 text-sm text-tx-strong">{c.role}</td>
                  <td className="py-3">
                    {c.department && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/20 text-acao">{c.department}</span>
                    )}
                  </td>
                  <td className="py-3 text-sm text-tx-muted">{new Date(c.admissionDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 text-sm text-right font-mono text-tx-strong">{Number(c.baseSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-400/10 text-ok' : 'bg-gray-400/10 text-tx-muted'}`}>
                      {c.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-inset border border-line rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-tx-strong">Novo Colaborador</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-tx-muted mb-1.5">Nome Completo *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="João da Silva" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">CPF *</label>
                <input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">CTPS</label>
                <input value={form.ctps} onChange={e => setForm(f => ({ ...f, ctps: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="000000/001-SP" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">PIS/PASEP</label>
                <input value={form.pis} onChange={e => setForm(f => ({ ...f, pis: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="000.00000.00-0" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Cargo *</label>
                <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Analista Contábil" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Departamento</label>
                <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Contabilidade" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Admissão *</label>
                <input type="date" value={form.admissionDate} onChange={e => setForm(f => ({ ...f, admissionDate: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Salário Base (R$) *</label>
                <input type="number" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="3000.00" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Dependentes</label>
                <input type="number" min="0" value={form.dependents} onChange={e => setForm(f => ({ ...f, dependents: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2 border-t border-line pt-3">
                <p className="text-sm text-tx-muted font-medium mb-3">Dados Bancários</p>
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Banco</label>
                <input value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Itaú" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Agência</label>
                <input value={form.bankAgency} onChange={e => setForm(f => ({ ...f, bankAgency: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="0001" />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-1.5">Conta</label>
                <input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} className="w-full bg-card border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="12345-6" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={saveForm} disabled={creating} className="btn-primary flex-1">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
