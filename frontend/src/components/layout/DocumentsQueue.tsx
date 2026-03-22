'use client';
import { FileText, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

const MOCK_QUEUE = [
  { id: '1', name: 'NF-001234.pdf', status: 'processing', type: 'Nota Fiscal', value: 1500 },
  { id: '2', name: 'Boleto_03_2024.jpg', status: 'completed', type: 'Boleto', value: 850 },
  { id: '3', name: 'Extrato_Banco.pdf', status: 'needs_review', type: 'Extrato', value: null },
  { id: '4', name: 'NF-005678.pdf', status: 'completed', type: 'Nota Fiscal', value: 3200 },
];

const statusIcon = (s: string) => {
  if (s === 'completed') return <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />;
  if (s === 'needs_review') return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />;
  return <Loader2 className="h-3.5 w-3.5 text-brand-500 animate-spin flex-shrink-0" />;
};

export function DocumentsQueue() {
  return (
    <div className="card-aura h-full">
      <h2 className="text-lg font-semibold text-white mb-4">Fila de Documentos</h2>
      <div className="space-y-3">
        {MOCK_QUEUE.map(doc => (
          <div key={doc.id} className="flex items-center gap-3 p-3 bg-surface rounded-lg">
            <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{doc.name}</p>
              <p className="text-xs text-gray-500">{doc.type}</p>
            </div>
            <div className="flex items-center gap-2">
              {doc.value && (
                <span className="text-xs text-gray-400 font-mono">
                  R${doc.value.toLocaleString('pt-BR')}
                </span>
              )}
              {statusIcon(doc.status)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
