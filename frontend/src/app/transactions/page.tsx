'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { CheckCircle, Clock, XCircle, TrendingUp, TrendingDown } from 'lucide-react';

const GET_TRANSACTIONS = gql`
  query GetTransactions($companyId: String!, $status: String) {
    transactions(companyId: $companyId, status: $status) {
      id
      description
      date
      status
      totalDebit
      totalCredit
      isBalanced
      aiConfidence
      entries
      createdAt
    }
  }
`;

const statusConfig = {
  draft: { label: 'Rascunho', icon: Clock, color: 'text-gray-400' },
  pending_review: { label: 'Aguardando', icon: Clock, color: 'text-yellow-400' },
  approved: { label: 'Aprovado', icon: CheckCircle, color: 'text-green-400' },
  rejected: { label: 'Rejeitado', icon: XCircle, color: 'text-red-400' },
  reconciled: { label: 'Reconciliado', icon: CheckCircle, color: 'text-blue-400' },
};

export default function TransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data, loading } = useQuery(GET_TRANSACTIONS, {
    variables: { companyId: 'company-demo-001', status: statusFilter },
    errorPolicy: 'all',
  });

  const transactions = data?.transactions ?? [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Lançamentos Contábeis</h1>
        <div className="flex gap-2">
          {[undefined, 'pending_review', 'approved', 'rejected'].map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                statusFilter === s
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {s === undefined ? 'Todos' : statusConfig[s as keyof typeof statusConfig]?.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-aura">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando lançamentos...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Nenhum lançamento encontrado.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-surface-border">
                <th className="pb-3 font-medium">Data</th>
                <th className="pb-3 font-medium">Descrição</th>
                <th className="pb-3 font-medium text-right">Débito</th>
                <th className="pb-3 font-medium text-right">Crédito</th>
                <th className="pb-3 font-medium text-center">Status</th>
                <th className="pb-3 font-medium text-center">IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {transactions.map((tx: any) => {
                const cfg = statusConfig[tx.status as keyof typeof statusConfig];
                const Icon = cfg?.icon ?? Clock;
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
                      <div className={`flex items-center justify-center gap-1.5 ${cfg?.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="text-xs">{cfg?.label}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      {tx.aiConfidence ? (
                        <span className="text-xs text-brand-500 font-mono">
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
