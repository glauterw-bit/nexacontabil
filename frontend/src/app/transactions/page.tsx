'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { TrendingUp, TrendingDown, Building2, ArrowRightLeft } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { PageHeader, StatusChip, EmptyState, Spinner, COLORS } from '@/components/ui/kit';
import type { StatusTone } from '@/components/ui/kit';

const GET_TRANSACTIONS = gql`
  query GetTransactions($companyId: String!, $status: String) {
    transactions(companyId: $companyId, status: $status) {
      id description date status totalDebit totalCredit isBalanced aiConfidence entries createdAt
    }
  }
`;

const statusConfig: Record<string, { label: string; tone: StatusTone }> = {
  draft:          { label: 'Rascunho',     tone: 'pendente' },
  pending_review: { label: 'Aguardando',   tone: 'atencao' },
  approved:       { label: 'Aprovado',     tone: 'ok' },
  rejected:       { label: 'Rejeitado',    tone: 'critico' },
  reconciled:     { label: 'Reconciliado', tone: 'processando' },
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para ver os lançamentos." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<ArrowRightLeft size={22} color={COLORS.acao} />}
        title="Lançamentos Contábeis"
        subtitle={selectedCompany.name}
        action={
          <div className="flex gap-2">
            {[undefined, 'pending_review', 'approved', 'rejected'].map(s => (
              <button
                key={s ?? 'all'}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  statusFilter === s
                    ? 'bg-acao text-white'
                    : 'text-tx-muted hover:text-tx-strong hover:bg-inset'
                }`}
              >
                {s === undefined ? 'Todos' : statusConfig[s]?.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="card-aura">
        {loading ? (
          <Spinner />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={40} />}
            title="Nenhum lançamento encontrado."
            sub="Envie um documento para gerar lançamentos automáticos."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th className="num">Débito</th>
                  <th className="num">Crédito</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">IA</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any) => {
                  const cfg = statusConfig[tx.status] ?? statusConfig.draft;
                  return (
                    <tr key={tx.id}>
                      <td className="text-tx-muted">
                        {new Date(tx.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="text-tx-strong max-w-xs truncate">{tx.description}</td>
                      <td className="num">
                        <span className="inline-flex items-center justify-end gap-1">
                          <TrendingDown className="h-3 w-3 text-tx-faint" />
                          {Number(tx.totalDebit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </td>
                      <td className="num">
                        <span className="inline-flex items-center justify-end gap-1">
                          <TrendingUp className="h-3 w-3 text-tx-faint" />
                          {Number(tx.totalCredit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </td>
                      <td className="text-center">
                        <StatusChip size="sm" tone={cfg.tone} label={cfg.label} />
                      </td>
                      <td className="text-center">
                        {tx.aiConfidence ? (
                          <span className="num text-xs text-tx-muted">
                            {(tx.aiConfidence * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-tx-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
