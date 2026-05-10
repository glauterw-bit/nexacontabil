'use client';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { FileText, Loader2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';

const GET_PENDING = gql`
  query GetPendingDocs($companyId: String!) {
    documents(companyId: $companyId) {
      id type status issuerName totalValue issueDate
    }
  }
`;

interface Props { companyId: string }

const statusIcon = (s: string) => {
  if (s === 'completed')    return <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />;
  if (s === 'needs_review') return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />;
  if (s === 'pending')      return <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />;
  return <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin flex-shrink-0" />;
};

const typeLabel: Record<string, string> = {
  nota_fiscal: 'Nota Fiscal',
  boleto: 'Boleto',
  extrato_bancario: 'Extrato',
  contrato: 'Contrato',
  recibo: 'Recibo',
  other: 'Outro',
};

export function DocumentsQueue({ companyId }: Props) {
  const { data, loading } = useQuery(GET_PENDING, {
    variables: { companyId },
    skip: !companyId,
  });

  const docs = (data?.documents ?? []).slice(0, 6);

  return (
    <div className="card-aura h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white">Últimos Documentos</h2>
        <Link href="/documents" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Ver todos →
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <FileText className="h-8 w-8 text-gray-600 mb-2" />
          <p className="text-sm text-gray-500">Nenhum documento ainda</p>
          <Link href="/documents" className="text-xs text-indigo-400 mt-2 hover:underline">
            Enviar primeiro documento
          </Link>
        </div>
      ) : (
        <div className="space-y-2 flex-1">
          {docs.map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 bg-[#0f1117] rounded-lg">
              <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {doc.issuerName || typeLabel[doc.type] || 'Documento'}
                </p>
                <p className="text-xs text-gray-500">{typeLabel[doc.type] ?? doc.type}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {doc.totalValue != null && (
                  <span className="text-xs text-gray-400 font-mono">
                    R${Number(doc.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </span>
                )}
                {statusIcon(doc.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
