'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Building2, Plus, CheckCircle, Loader2, ChevronRight,
  Users, Pencil, PowerOff, X, Save
} from 'lucide-react';

const GET_COMPANIES = gql`
  query GetCompanies {
    companies { id name cnpj taxRegime email phone address active createdAt }
  }
`;

const CREATE_COMPANY = gql`
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) { id name cnpj taxRegime active }
  }
`;

const UPDATE_COMPANY = gql`
  mutation UpdateCompany($id: ID!, $name: String, $address: String, $phone: String, $email: String, $taxRegime: String) {
    updateCompany(id: $id, name: $name, address: $address, phone: $phone, email: $email, taxRegime: $taxRegime) {
      id name cnpj taxRegime address phone email active
    }
  }
`;

const DEACTIVATE_COMPANY = gql`
  mutation DeactivateCompany($id: ID!) {
    deactivateCompany(id: $id) { id active }
  }
`;

const TAX_REGIMES = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido',  label: 'Lucro Presumido' },
  { value: 'lucro_real',       label: 'Lucro Real' },
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO',  label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL',       label: 'Lucro Real' },
  { value: 'MEI',              label: 'MEI' },
];

function taxLabel(v: string) {
  const found = TAX_REGIMES.find(r => r.value === v);
  return found?.label ?? v?.replace('_', ' ');
}

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export default function CompaniesPage() {
  const router = useRouter();
  const { setSelectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: '', cnpj: '', taxRegime: 'simples_nacional', email: '', phone: '', address: '' });
  const [editForm, setEditForm] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, loading, refetch } = useQuery(GET_COMPANIES);
  const [createCompany, { loading: creating }] = useMutation(CREATE_COMPANY, {
    onCompleted: (d) => {
      setSuccess(`Empresa "${d.createCompany.name}" cadastrada com sucesso!`);
      setForm({ name: '', cnpj: '', taxRegime: 'simples_nacional', email: '', phone: '', address: '' });
      setShowForm(false);
      setError('');
      refetch();
      setTimeout(() => setSuccess(''), 4000);
    },
    onError: (e) => setError(e.message),
  });
  const [updateCompany, { loading: updating }] = useMutation(UPDATE_COMPANY, {
    onCompleted: () => {
      setSuccess('Empresa atualizada!');
      setEditTarget(null);
      refetch();
      setTimeout(() => setSuccess(''), 3000);
    },
    onError: (e) => setError(e.message),
  });
  const [deactivateCompany] = useMutation(DEACTIVATE_COMPANY, {
    onCompleted: () => { refetch(); },
  });

  const companies = data?.companies ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nome é obrigatório');
    const cnpjDigits = form.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) return setError('CNPJ deve ter 14 dígitos');
    createCompany({
      variables: {
        input: {
          name: form.name.trim(),
          cnpj: cnpjDigits,
          taxRegime: form.taxRegime,
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        },
      },
    });
  };

  const startEdit = (company: any) => {
    setEditTarget(company);
    setEditForm({
      name: company.name,
      taxRegime: company.taxRegime,
      email: company.email ?? '',
      phone: company.phone ?? '',
      address: company.address ?? '',
    });
    setError('');
  };

  const handleUpdate = () => {
    if (!editForm.name?.trim()) return setError('Nome é obrigatório');
    updateCompany({
      variables: {
        id: editTarget.id,
        name: editForm.name,
        taxRegime: editForm.taxRegime,
        address: editForm.address || undefined,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
      },
    });
  };

  const handleDeactivate = (company: any) => {
    if (!confirm(`Desativar "${company.name}"?`)) return;
    deactivateCompany({ variables: { id: company.id } });
  };

  const handleSelect = (company: any) => {
    setSelectedCompany(company);
    router.push('/dashboard');
  };

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas / Clientes</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie os clientes cadastrados no sistema</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(''); }} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </button>
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <p className="text-green-400 text-sm font-medium">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card-aura">
          <h2 className="text-lg font-semibold text-white mb-6">Cadastrar Nova Empresa</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">Razão Social <span className="text-red-400">*</span></label>
                <input type="text" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Empresa XYZ Ltda"
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">CNPJ <span className="text-red-400">*</span></label>
                <input type="text" value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: maskCnpj(e.target.value) }))}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Regime Tributário <span className="text-red-400">*</span></label>
                <select value={form.taxRegime}
                  onChange={e => setForm(f => ({ ...f, taxRegime: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="simples_nacional">Simples Nacional</option>
                  <option value="lucro_presumido">Lucro Presumido</option>
                  <option value="lucro_real">Lucro Real</option>
                  <option value="MEI">MEI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">E-mail</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contato@empresa.com"
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Telefone</label>
                <input type="text" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">Endereço</label>
                <input type="text" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Rua, número, bairro, cidade/UF"
                  className="w-full bg-[#0f1117] border border-[#1e2740] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? 'Cadastrando...' : 'Cadastrar Empresa'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-8 w-full max-w-lg space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Editar Empresa</h2>
              <button onClick={() => setEditTarget(null)} className="text-gray-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1 pb-4 border-b border-[#1e2740]">
              <p className="text-xs text-gray-500">CNPJ (não editável)</p>
              <p className="text-white font-mono text-sm">{formatCnpj(editTarget.cnpj)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Razão Social</label>
                <input value={editForm.name ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#161b2e] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Regime Tributário</label>
                <select value={editForm.taxRegime ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, taxRegime: e.target.value }))}
                  className="w-full bg-[#161b2e] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500">
                  <option value="simples_nacional">Simples Nacional</option>
                  <option value="lucro_presumido">Lucro Presumido</option>
                  <option value="lucro_real">Lucro Real</option>
                  <option value="MEI">MEI</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">E-mail</label>
                <input value={editForm.email ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-[#161b2e] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Telefone</label>
                <input value={editForm.phone ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-[#161b2e] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1.5">Endereço</label>
                <input value={editForm.address ?? ''}
                  onChange={e => setEditForm((f: any) => ({ ...f, address: e.target.value }))}
                  className="w-full bg-[#161b2e] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditTarget(null)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={handleUpdate} disabled={updating}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Companies List */}
      <div className="card-aura">
        <div className="flex items-center gap-3 mb-6">
          <Users className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">
            {companies.length} {companies.length === 1 ? 'empresa cadastrada' : 'empresas cadastradas'}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-indigo-400 animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhuma empresa cadastrada ainda.</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Cadastrar primeira empresa
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((company: any) => (
              <div key={company.id}
                className="flex items-center gap-4 p-4 bg-[#0f1117] rounded-xl border border-[#1e2740] hover:border-indigo-500/40 transition-all group">
                <div className="h-10 w-10 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium truncate">{company.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                      company.active
                        ? 'text-green-400 border-green-400/30 bg-green-400/10'
                        : 'text-red-400 border-red-400/30 bg-red-400/10'
                    }`}>
                      {company.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-gray-500 font-mono">{formatCnpj(company.cnpj)}</p>
                    <span className="text-gray-600 text-xs">·</span>
                    <p className="text-xs text-gray-500">{taxLabel(company.taxRegime)}</p>
                    {company.email && (
                      <>
                        <span className="text-gray-600 text-xs">·</span>
                        <p className="text-xs text-gray-500 truncate">{company.email}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions — visible on hover */}
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(company)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-[#1e2740] hover:border-indigo-500/40 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  {company.active && (
                    <button onClick={() => handleDeactivate(company)}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-400/20 hover:border-red-400/40 transition-colors">
                      <PowerOff className="h-3.5 w-3.5" />
                      Desativar
                    </button>
                  )}
                  <button onClick={() => handleSelect(company)}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-white hover:bg-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-500/30 hover:border-indigo-600 transition-all">
                    Selecionar
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
