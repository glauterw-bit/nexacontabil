'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { Plus, Download, X, Search, Filter, FileText, Loader2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, COLORS, EmptyState, Spinner, StatusChip, StatusTone } from '@/components/ui/kit';

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

const statusConfig: Partial<Record<NFStatus, { label: string; tone: StatusTone }>> = {
  rascunho: { label: 'Rascunho', tone: 'pendente' },
  autorizada: { label: 'Autorizada', tone: 'ok' },
  rejeitada: { label: 'Rejeitada', tone: 'critico' },
  cancelada: { label: 'Cancelada', tone: 'critico' },
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para gerenciar notas fiscais." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<FileText size={22} color={COLORS.acao} />}
        title="NF-e / NFS-e — Notas Fiscais"
        subtitle={`${selectedCompany.name} · Total autorizado: ${totalAutorizadas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
        action={
          <Link href="/fiscal/nova" className="btn-primary">
            <Plus className="h-4 w-4" />
            Nova Nota
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por destinatário, número ou CNPJ..."
            className="input-aura w-full pl-10" />
        </div>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          className="input-aura">
          <option value="todos">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
          className="input-aura">
          <option value="todos">Todos os tipos</option>
          <option value="NF-e">NF-e</option>
          <option value="NFS-e">NFS-e</option>
          <option value="NF-CE">NF-CE</option>
        </select>
      </div>

      {/* Table */}
      <div className="card-aura overflow-x-auto">
        {loading ? (
          <Spinner />
        ) : (
          <>
            <table className="table-aura min-w-[800px]">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Tipo</th>
                  <th>Destinatário</th>
                  <th>CNPJ/CPF</th>
                  <th className="num">Valor</th>
                  <th>Emissão</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => {
                  const cfg = statusConfig[n.status] ?? { label: n.status, tone: 'pendente' as StatusTone };
                  return (
                    <tr key={n.id} className={n.status === 'cancelada' ? 'opacity-50' : ''}>
                      <td className="font-mono">{n.numero}</td>
                      <td>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-inset text-tx-muted">{n.tipo}</span>
                      </td>
                      <td className="text-tx-strong">{n.destinatario}</td>
                      <td className="text-tx-muted font-mono">{n.cnpjCpf}</td>
                      <td className="num text-tx-strong">{n.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                      <td className="text-tx-muted">{new Date(n.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="text-center">
                        <StatusChip tone={cfg.tone} label={cfg.label} size="sm" />
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {n.chaveAcesso && (
                            <button className="btn-ghost p-1.5" title="Download XML">
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
              <EmptyState icon={<FileText size={40} />} title="Nenhuma nota encontrada com os filtros aplicados." />
            )}
          </>
        )}
      </div>
    </div>
  );
}
