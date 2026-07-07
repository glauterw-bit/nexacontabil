'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Plus, Download, CheckCircle, Search, Printer, Loader2, X, Banknote, Copy } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Kpi, StatusChip, Spinner, EmptyState, COLORS, StatusTone } from '@/components/ui/kit';

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

const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pendente', tone: 'atencao' },
  pendente: { label: 'Pendente', tone: 'atencao' },
  paid: { label: 'Pago', tone: 'ok' },
  pago: { label: 'Pago', tone: 'ok' },
  overdue: { label: 'Vencido', tone: 'critico' },
  vencido: { label: 'Vencido', tone: 'critico' },
  cancelled: { label: 'Cancelado', tone: 'pendente' },
  cancelado: { label: 'Cancelado', tone: 'pendente' },
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa" sub="Escolha uma empresa da carteira para ver os boletos." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-5">
      <PageHeader
        icon={<Banknote size={22} color={COLORS.acao} />}
        title="Boletos"
        subtitle={`${selectedCompany.name} · ${boletos.length} boleto(s)`}
        action={
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo boleto
          </button>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <Kpi label="Pendentes" value={brl(totals.pendentes)} cor={COLORS.atencao} />
        <Kpi label="Vencidos" value={brl(totals.vencidos)} cor={COLORS.erro} />
        <Kpi label="Pagos" value={brl(totals.pagos)} cor={COLORS.ok} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por pagador ou CNPJ/CPF"
            className="input-aura w-full pl-9"
          />
        </div>
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
          className="input-aura"
        >
          <option value="todos">Todos status</option>
          <option value="pending">Pendentes</option>
          <option value="paid">Pagos</option>
          <option value="overdue">Vencidos</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="card-aura">
          <EmptyState
            icon={<Banknote size={40} />}
            title="Nenhum boleto encontrado"
            sub="Crie um boleto manual ou configure o Banco Inter API em /integracoes para emissão automática."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => {
            const sc = STATUS_MAP[b.status] ?? { label: b.status, tone: 'pendente' as StatusTone };
            const isVencido = (b.status === 'pending' || b.status === 'pendente') && new Date(b.dueDate) < new Date();
            const venc = new Date(b.dueDate).toLocaleDateString('pt-BR');
            return (
              <div key={b.id} className="card-aura hover:border-[var(--acao)] transition-colors">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[13px] font-medium text-tx-strong truncate">{b.payerName}</p>
                    <p className="text-[11px] text-tx-muted font-mono">{b.payerCnpjCpf} · vence {venc}</p>
                  </div>
                  <span className="num text-[15px] font-bold text-tx-strong">{brl(b.amount)}</span>
                  <StatusChip tone={isVencido ? 'critico' : sc.tone} label={isVencido ? 'Vencido' : sc.label} size="sm" />
                  <div className="flex gap-1 items-center">
                    {b.digitableLine && (
                      <button onClick={() => copyLine(b.digitableLine!)} className="btn-ghost p-1.5" title="Copiar linha">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(b.status === 'pending' || b.status === 'pendente') && (
                      <>
                        <button onClick={() => markPaid({ variables: { id: b.id } })} className="btn-secondary text-xs px-2.5 py-1.5">
                          Marcar pago
                        </button>
                        <button onClick={() => confirm('Cancelar boleto?') && cancelBoleto({ variables: { id: b.id } })} className="btn-ghost text-xs px-2.5 py-1.5 text-err">
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {b.digitableLine && (
                  <p className="text-[11px] font-mono text-tx-muted mt-1 truncate">{b.digitableLine}</p>
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

function NewBoletoModal({ companyId, onClose, onCreate, loading }: any) {
  const [form, setForm] = useState({
    payerName: '', payerCnpjCpf: '', amount: 0, dueDate: new Date().toISOString().slice(0, 10),
    beneficiaryName: '', beneficiaryCnpj: '', instructions: '',
  });
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(13,17,25,0.45)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-line rounded-xl shadow-pop overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex justify-between">
          <p className="text-sm font-medium text-tx-strong">Novo boleto</p>
          <button onClick={onClose} className="btn-ghost p-1"><X className="h-4 w-4" /></button>
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
              <label className="text-[11px] uppercase text-tx-faint tracking-wider block mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.k]}
                onChange={(e) => setForm({ ...form, [f.k]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                className="input-aura w-full"
              />
            </div>
          ))}
          <button
            onClick={() => onCreate({ variables: { input: { companyId, ...form, dueDate: new Date(form.dueDate) } } })}
            disabled={loading || !form.payerName || form.amount <= 0}
            className="btn-primary w-full justify-center"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : 'Criar boleto'}
          </button>
        </div>
      </div>
    </div>
  );
}
