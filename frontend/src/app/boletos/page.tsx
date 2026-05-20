'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Plus, Download, CheckCircle, Search, Printer, Loader2, X, Banknote, Copy } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const LIST_BOLETOS = gql`
  query Boletos($companyId: String!) {
    boletos(companyId: $companyId) {
      id payerName payerCnpjCpf amount dueDate status
      digitableLine barcode ourNumber bankCode
      instructions fine interest discount paidAt
    }
  }
`;

const CREATE_BOLETO = gql`
  mutation CreateBoleto($input: CreateBoletoInput!) {
    createBoleto(input: $input) { id }
  }
`;

const MARK_PAID = gql`
  mutation MarkPaid($id: ID!) {
    markBoletoAsPaid(id: $id) { id status }
  }
`;

const CANCEL_BOLETO = gql`
  mutation CancelBoleto($id: ID!) {
    cancelBoleto(id: $id) { id status }
  }
`;

interface Boleto {
  id: string;
  payerName: string;
  payerCnpjCpf: string;
  amount: number;
  dueDate: string;
  status: string;
  digitableLine?: string;
  barcode?: string;
  ourNumber: string;
  bankCode: string;
  instructions?: string;
  paidAt?: string;
}

const STATUS_MAP: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pendente', classes: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  pendente: { label: 'Pendente', classes: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  paid: { label: 'Pago', classes: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  pago: { label: 'Pago', classes: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  overdue: { label: 'Vencido', classes: 'text-red-300 bg-red-500/10 border-red-500/30' },
  vencido: { label: 'Vencido', classes: 'text-red-300 bg-red-500/10 border-red-500/30' },
  cancelled: { label: 'Cancelado', classes: 'text-gray-400 bg-gray-500/10 border-gray-500/30' },
  cancelado: { label: 'Cancelado', classes: 'text-gray-400 bg-gray-500/10 border-gray-500/30' },
};

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function BoletosPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [showNew, setShowNew] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [search, setSearch] = useState('');

  const companyId = selectedCompany?.id ?? '';
  const { data, loading, refetch } = useQuery(LIST_BOLETOS, {
    variables: { companyId },
    skip: !companyId,
  });

  const [createBoleto, { loading: creating }] = useMutation(CREATE_BOLETO, {
    onCompleted: () => { toast.push('Boleto criado', { variant: 'success' }); setShowNew(false); refetch(); },
    onError: (e) => toast.push(e.message, { variant: 'error' }),
  });
  const [markPaid] = useMutation(MARK_PAID, {
    onCompleted: () => { toast.push('Marcado como pago', { variant: 'success' }); refetch(); },
  });
  const [cancelBoleto] = useMutation(CANCEL_BOLETO, {
    onCompleted: () => { toast.push('Cancelado', { variant: 'success' }); refetch(); },
  });

  const boletos: Boleto[] = data?.boletos ?? [];

  const filtered = boletos.filter((b) => {
    if (statusFiltro !== 'todos' && b.status !== statusFiltro) return false;
    if (search) {
      const s = search.toLowerCase();
      return b.payerName.toLowerCase().includes(s) || b.payerCnpjCpf.includes(s);
    }
    return true;
  });

  const totals = {
    pendentes: boletos.filter((b) => b.status === 'pending' || b.status === 'pendente').reduce((s, b) => s + b.amount, 0),
    pagos: boletos.filter((b) => b.status === 'paid' || b.status === 'pago').reduce((s, b) => s + b.amount, 0),
    vencidos: boletos.filter((b) => {
      if (b.status === 'paid' || b.status === 'pago' || b.status === 'cancelled') return false;
      return new Date(b.dueDate) < new Date();
    }).reduce((s, b) => s + b.amount, 0),
  };

  function copyLine(line: string) {
    navigator.clipboard.writeText(line);
    toast.push('Linha digitável copiada', { variant: 'info' });
  }

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Banknote className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Boletos</h1>
          </div>
          <p className="text-sm text-gray-400">{selectedCompany.name} · {boletos.length} boleto(s)</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Novo boleto
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <KPI label="Pendentes" value={brl(totals.pendentes)} color="text-amber-400" />
        <KPI label="Vencidos" value={brl(totals.vencidos)} color="text-red-400" />
        <KPI label="Pagos" value={brl(totals.pagos)} color="text-emerald-400" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por pagador ou CNPJ/CPF"
            className="w-full pl-9 pr-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded text-sm text-white outline-none"
          />
        </div>
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
          className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded text-sm text-white outline-none"
        >
          <option value="todos">Todos status</option>
          <option value="pending">Pendentes</option>
          <option value="paid">Pagos</option>
          <option value="overdue">Vencidos</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <Banknote className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Nenhum boleto encontrado</p>
          <p className="text-xs text-gray-500 mt-1">
            Crie um boleto manual ou configure o Banco Inter API em /integracoes para emissão automática.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => {
            const sc = STATUS_MAP[b.status] ?? { label: b.status, classes: 'text-gray-400' };
            const isVencido = (b.status === 'pending' || b.status === 'pendente') && new Date(b.dueDate) < new Date();
            const venc = new Date(b.dueDate).toLocaleDateString('pt-BR');
            return (
              <div key={b.id} className="rounded-lg border border-[#1e2740] bg-[#161b2e] p-3 hover:border-indigo-500/40 transition-colors">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium text-white truncate">{b.payerName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{b.payerCnpjCpf} · vence {venc}</p>
                  </div>
                  <span className="text-lg font-bold text-emerald-300 font-mono">{brl(b.amount)}</span>
                  <span className={`px-2 py-0.5 text-[10px] border rounded ${sc.classes}`}>
                    {isVencido ? 'Vencido' : sc.label}
                  </span>
                  <div className="flex gap-1">
                    {b.digitableLine && (
                      <button onClick={() => copyLine(b.digitableLine!)} className="p-1.5 text-gray-400 hover:text-white" title="Copiar linha">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(b.status === 'pending' || b.status === 'pendente') && (
                      <>
                        <button onClick={() => markPaid({ variables: { id: b.id } })} className="px-2 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded">
                          Marcar pago
                        </button>
                        <button onClick={() => confirm('Cancelar boleto?') && cancelBoleto({ variables: { id: b.id } })} className="px-2 py-1 text-[10px] bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded">
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {b.digitableLine && (
                  <p className="text-[10px] font-mono text-gray-500 mt-1 truncate">{b.digitableLine}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewBoletoModal companyId={companyId} onClose={() => setShowNew(false)} onCreate={createBoleto} loading={creating} />}
    </div>
  );
}

function KPI({ label, value, color }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function NewBoletoModal({ companyId, onClose, onCreate, loading }: any) {
  const [form, setForm] = useState({
    payerName: '', payerCnpjCpf: '', amount: 0, dueDate: new Date().toISOString().slice(0, 10),
    beneficiaryName: '', beneficiaryCnpj: '', instructions: '',
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161b2e] border border-[#2a3550] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2740] flex justify-between">
          <p className="text-sm font-medium text-white">Novo boleto</p>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          {[
            { k: 'beneficiaryName', label: 'Beneficiário (Razão Social do escritório)', type: 'text' },
            { k: 'beneficiaryCnpj', label: 'CNPJ do beneficiário', type: 'text' },
            { k: 'payerName', label: 'Nome do pagador', type: 'text' },
            { k: 'payerCnpjCpf', label: 'CNPJ/CPF do pagador', type: 'text' },
            { k: 'amount', label: 'Valor (R$)', type: 'number' },
            { k: 'dueDate', label: 'Vencimento', type: 'date' },
            { k: 'instructions', label: 'Descrição (opcional)', type: 'text' },
          ].map((f) => (
            <div key={f.k}>
              <label className="text-[10px] uppercase text-gray-500 tracking-wider block mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.k]}
                onChange={(e) => setForm({ ...form, [f.k]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-sm text-white outline-none"
              />
            </div>
          ))}
          <button
            onClick={() => onCreate({ variables: { input: { companyId, ...form, dueDate: new Date(form.dueDate) } } })}
            disabled={loading || !form.payerName || form.amount <= 0}
            className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : 'Criar boleto'}
          </button>
        </div>
      </div>
    </div>
  );
}
