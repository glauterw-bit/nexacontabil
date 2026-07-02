'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Plus, Download, X, Search, Filter, FileText, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const LIST_NOTES = gql`
  query FiscalNotes($companyId: String!) {
    fiscalNotes(companyId: $companyId) {
      id type status number series accessKey issueDate
      recipientName recipientCnpjCpf totalValue
      rejectionMessage createdAt
    }
  }
`;

const CANCEL_NOTE = gql`
  mutation CancelFiscalNote($id: ID!, $reason: String!) {
    cancelFiscalNote(id: $id, reason: $reason) { id status }
  }
`;

type NFStatus = 'rascunho' | 'autorizada' | 'rejeitada' | 'cancelada' | 'draft' | 'authorized' | 'rejected' | 'cancelled';
type NFTipo = 'NF-e' | 'NFS-e' | 'NF-CE' | 'nfe' | 'nfse';

interface NotaFiscal {
  id: string;
  numero: string;
  tipo: NFTipo;
  destinatario: string;
  cnpjCpf: string;
  valor: number;
  dataEmissao: string;
  status: NFStatus;
  chaveAcesso?: string;
}

const statusConfig: Partial<Record<NFStatus, { label: string; color: string; bg: string; border: string }>> = {
  rascunho: { label: 'Rascunho', color: 'text-tx-muted', bg: 'bg-gray-400/10', border: 'border-gray-400/30' },
  autorizada: { label: 'Autorizada', color: 'text-ok', bg: 'bg-green-400/10', border: 'border-green-400/30' },
  rejeitada: { label: 'Rejeitada', color: 'text-err', bg: 'bg-red-400/10', border: 'border-red-400/30' },
  cancelada: { label: 'Cancelada', color: 'text-err', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const tipoColors: Partial<Record<NFTipo, string>> = {
  'NF-e': 'bg-indigo-600/20 text-acao',
  'NFS-e': 'bg-purple-600/20 text-purple-400',
  'NF-CE': 'bg-cyan-600/20 text-cyan-400',
};

// normaliza tipo/status do backend pro vocab da UI legada
function normTipo(t: string): NFTipo {
  const m: Record<string, NFTipo> = { nfe: 'NF-e', nfse: 'NFS-e', cte: 'NF-e', boleto: 'NF-e' };
  return (m[t?.toLowerCase()] ?? 'NF-e') as NFTipo;
}
function normStatus(s: string): NFStatus {
  const m: Record<string, NFStatus> = {
    draft: 'rascunho', rascunho: 'rascunho',
    authorized: 'autorizada', autorizada: 'autorizada', autorized: 'autorizada',
    rejected: 'rejeitada', rejeitada: 'rejeitada',
    cancelled: 'cancelada', canceled: 'cancelada', cancelada: 'cancelada',
  };
  return (m[s?.toLowerCase()] ?? 'rascunho') as NFStatus;
}

export default function FiscalPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');

  const companyId = selectedCompany?.id ?? '';
  const { data, loading, refetch } = useQuery(LIST_NOTES, {
    variables: { companyId },
    skip: !companyId,
  });
  const [cancelMutation] = useMutation(CANCEL_NOTE, {
    onCompleted: () => { toast.push('Nota cancelada', { variant: 'success' }); refetch(); },
    onError: (e) => toast.push(e.message, { variant: 'error', title: 'Erro' }),
  });

  const rawNotes: any[] = data?.fiscalNotes ?? [];
  const notas: NotaFiscal[] = rawNotes.map((r) => ({
    id: r.id,
    numero: r.number ? String(r.number).padStart(9, '0') : r.id.slice(0, 9),
    tipo: normTipo(r.type),
    destinatario: r.recipientName,
    cnpjCpf: r.recipientCnpjCpf,
    valor: r.totalValue,
    dataEmissao: r.issueDate ?? r.createdAt,
    status: normStatus(r.status),
    chaveAcesso: r.accessKey,
  }));

  const cancelar = (id: string) => {
    const reason = prompt('Motivo do cancelamento (mínimo 15 caracteres):');
    if (!reason || reason.trim().length < 15) {
      toast.push('Motivo obrigatório com pelo menos 15 caracteres', { variant: 'warning' });
      return;
    }
    cancelMutation({ variables: { id, reason } });
  };

  const filtered = notas.filter(n => {
    const matchSearch = n.destinatario.toLowerCase().includes(search.toLowerCase()) ||
      n.numero.includes(search) || n.cnpjCpf.includes(search);
    const matchStatus = statusFiltro === 'todos' || n.status === statusFiltro;
    const matchTipo = tipoFiltro === 'todos' || n.tipo === tipoFiltro;
    return matchSearch && matchStatus && matchTipo;
  });

  const totalAutorizadas = notas.filter(n => n.status === 'autorizada').reduce((s, n) => s + n.valor, 0);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-tx-faint" />
        <p className="text-tx-muted text-sm">Selecione uma empresa para gerenciar notas fiscais.</p>
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-tx-strong">NF-e / NFS-e — Notas Fiscais</h1>
          <p className="text-tx-muted text-sm mt-1">{selectedCompany.name} · Total autorizado: <span className="text-ok font-medium">{totalAutorizadas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
        </div>
        <Link href="/fiscal/nova" className="btn-primary">
          <Plus className="h-4 w-4" />
          Nova Nota
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por destinatário, número ou CNPJ..."
            className="w-full bg-card border border-line rounded-lg pl-10 pr-4 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500 placeholder:text-tx-faint" />
        </div>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          className="bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500">
          <option value="todos">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
          className="bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500">
          <option value="todos">Todos os tipos</option>
          <option value="NF-e">NF-e</option>
          <option value="NFS-e">NFS-e</option>
          <option value="NF-CE">NF-CE</option>
        </select>
      </div>

      {/* Table */}
      <div className="card-aura overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="text-left text-xs text-tx-muted border-b border-line">
              <th className="pb-3 font-medium">Número</th>
              <th className="pb-3 font-medium">Tipo</th>
              <th className="pb-3 font-medium">Destinatário</th>
              <th className="pb-3 font-medium">CNPJ/CPF</th>
              <th className="pb-3 font-medium text-right">Valor</th>
              <th className="pb-3 font-medium">Emissão</th>
              <th className="pb-3 font-medium text-center">Status</th>
              <th className="pb-3 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map(n => {
              const cfg = statusConfig[n.status] ?? { label: n.status, color: 'text-tx-muted', bg: 'bg-gray-400/10', border: 'border-gray-400/30' };
              return (
                <tr key={n.id} className={`hover:bg-inset transition-colors ${n.status === 'cancelada' ? 'opacity-50' : ''}`}>
                  <td className="py-3 text-sm font-mono text-tx">{n.numero}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoColors[n.tipo]}`}>{n.tipo}</span>
                  </td>
                  <td className="py-3 text-sm text-tx-strong">{n.destinatario}</td>
                  <td className="py-3 text-sm text-tx-muted font-mono">{n.cnpjCpf}</td>
                  <td className="py-3 text-sm text-right font-mono text-tx-strong">{n.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-tx-muted">{new Date(n.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                  </td>
                  <td className="py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {n.chaveAcesso && (
                        <button className="btn-ghost p-1.5 text-tx-muted hover:text-tx-strong" title="Download XML">
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {n.status === 'autorizada' && (
                        <button onClick={() => cancelar(n.id)} className="btn-ghost p-1.5 text-err hover:text-err" title="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {n.status === 'rascunho' && (
                        <button className="btn-ghost p-1.5 text-acao hover:text-acao" title="Editar">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-tx-faint mx-auto mb-3" />
            <p className="text-tx-muted text-sm">Nenhuma nota encontrada com os filtros aplicados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
