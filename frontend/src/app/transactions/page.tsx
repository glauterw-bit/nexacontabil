'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { CheckCircle, Clock, XCircle, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';

const GET_TRANSACTIONS = gql`
  query GetTransactions($companyId: String!, $status: String) {
    transactions(companyId: $companyId, status: $status) {
      id description date status totalDebit totalCredit isBalanced aiConfidence entries createdAt
    }
  }
`;

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  draft:          { label: 'Rascunho',    icon: Clock,         color: 'text-gray-400' },
  pending_review: { label: 'Aguardando',  icon: Clock,         color: 'text-yellow-400' },
  approved:       { label: 'Aprovado',    icon: CheckCircle,   color: 'text-green-400' },
  rejected:       { label: 'Rejeitado',   icon: XCircle,       color: 'text-red-400' },
  reconciled:     { label: 'Reconciliado', icon: CheckCircle,  color: 'text-blue-400' },
};

export default function TransactionsPage() {
  const { selectedCompany } = useCompany();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, loading } = useQuery(GET_TRANSACTIONS, {
    variables: { companyId: selectedCompany?.id ?? '', status: statusFilter },
    skip: !selectedCompany,
    errorPolicy: 'all',
  });

  const transactions = data?.transactions ?? [];

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver os lançamentos.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Lançamentos Contábeis</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex gap-2">
          {[undefined, 'pending_review', 'approved', 'rejected'].map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === undefined ? 'Todos' : statusConfig[s]?.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-aura">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando lançamentos...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhum lançamento encontrado.</p>
            <p className="text-gray-600 text-xs mt-1">Envie um documento para gerar lançamentos automáticos.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                <th className="pb-3 font-medium">Data</th>
                <th className="pb-3 font-medium">Descrição</th>
                <th className="pb-3 font-medium text-right">Débito</th>
                <th className="pb-3 font-medium text-right">Crédito</th>
                <th className="pb-3 font-medium text-center">Status</th>
                <th className="pb-3 font-medium text-center">IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {transactions.map((tx: any) => {
                const cfg = statusConfig[tx.status] ?? statusConfig.draft;
                const Icon = cfg.icon;
                return (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 text-sm text-gray-400">
                      {new Date(tx.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 text-sm text-white max-w-xs truncate">{tx.description}</td>
                    <td className="py-3 text-sm text-right font-mono">
                      <span className="flex items-center justify-end gap-1 text-red-400">
                        <TrendingDown className="h-3 w-3" />
                        {Number(tx.totalDebit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </td>
                    <td className="py-3 text-sm text-right font-mono">
                      <span className="flex items-center justify-end gap-1 text-green-400">
                        <TrendingUp className="h-3 w-3" />
                        {Number(tx.totalCredit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <div className={`flex items-center justify-center gap-1.5 ${cfg.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{cfg.label}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      {tx.aiConfidence ? (
                        <span className="text-xs text-indigo-400 font-mono">
                          {(tx.aiConfidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
