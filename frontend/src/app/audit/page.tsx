'use client';
import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import {
  ShieldCheck, AlertTriangle, Loader2, Building2,
  Bot, User, Hash, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Filter
} from 'lucide-react';

const GET_AUDIT = gql`
  query GetAuditTrail($companyId: String!, $entityType: String) {
    auditTrail(companyId: $companyId, entityType: $entityType) {
      id
      action
      entityType
      entityId
      performedBy
      agentType
      oldValues
      newValues
      metadata
      previousHash
      currentHash
      createdAt
    }
  }
`;

const VERIFY_INTEGRITY = gql`
  query VerifyIntegrity($companyId: String!) {
    verifyAuditIntegrity(companyId: $companyId) {
      valid
      invalidEntries
    }
  }
`;

const ENTITY_TYPES = [
  { value: '', label: 'Todos os tipos' },
  { value: 'document', label: 'Documentos' },
  { value: 'transaction', label: 'Lançamentos' },
  { value: 'company', label: 'Empresas' },
  { value: 'user', label: 'Usuários' },
];

function actionColor(action: string) {
  if (action.includes('create') || action.includes('CREATE')) return 'text-green-400 bg-green-400/10 border-green-400/20';
  if (action.includes('update') || action.includes('UPDATE')) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
  if (action.includes('delete') || action.includes('DELETE') || action.includes('deactivate')) return 'text-red-400 bg-red-400/10 border-red-400/20';
  if (action.includes('approve') || action.includes('APPROVE')) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
  return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
}

function ago(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}m atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function EntryRow({ entry }: { entry: any }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[#1e2740] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-lg bg-[#0f1117] flex items-center justify-center flex-shrink-0">
          {entry.performedBy.startsWith('agent:') || entry.agentType
            ? <Bot className="h-4 w-4 text-indigo-400" />
            : <User className="h-4 w-4 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${actionColor(entry.action)}`}>
              {entry.action}
            </span>
            <span className="text-gray-400 text-xs">{entry.entityType}</span>
            <span className="text-gray-600 text-xs font-mono truncate">{entry.entityId.slice(0, 8)}…</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {entry.performedBy.replace('agent:', '')}
            {entry.agentType && <span className="text-indigo-500"> · {entry.agentType}</span>}
          </p>
        </div>
        <span className="text-gray-600 text-xs flex-shrink-0">{ago(entry.createdAt)}</span>
        {open ? <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-[#1e2740] p-4 bg-[#0a0d14] space-y-4 text-xs">
          {/* Hash chain */}
          <div className="space-y-1.5">
            <p className="text-gray-500 uppercase tracking-wider text-xs">Hash Chain (SHA-256)</p>
            <div className="font-mono text-gray-400 space-y-1 bg-[#0f1117] rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-gray-600 w-14 flex-shrink-0">anterior:</span>
                <span className="break-all text-gray-500">{entry.previousHash || '(genesis)'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-gray-600 w-14 flex-shrink-0">atual:</span>
                <span className="break-all text-indigo-400">{entry.currentHash}</span>
              </div>
            </div>
          </div>

          {/* Values */}
          {(entry.oldValues || entry.newValues) && (
            <div className="grid grid-cols-2 gap-3">
              {entry.oldValues && (
                <div>
                  <p className="text-gray-500 mb-1.5">Valores anteriores</p>
                  <pre className="bg-red-400/5 border border-red-400/10 rounded-lg p-3 text-red-300 overflow-auto max-h-32 text-xs">
                    {JSON.stringify(entry.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {entry.newValues && (
                <div>
                  <p className="text-gray-500 mb-1.5">Novos valores</p>
                  <pre className="bg-green-400/5 border border-green-400/10 rounded-lg p-3 text-green-300 overflow-auto max-h-32 text-xs">
                    {JSON.stringify(entry.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {entry.metadata && (
            <div>
              <p className="text-gray-500 mb-1.5">Metadados</p>
              <pre className="bg-[#0f1117] border border-[#1e2740] rounded-lg p-3 text-gray-400 overflow-auto max-h-32 text-xs">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          <div className="text-gray-600 text-xs">
            {new Date(entry.createdAt).toLocaleString('pt-BR')}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  const { selectedCompany } = useCompany();
  const [entityType, setEntityType] = useState('');
  const [verifying, setVerifying] = useState(false);

  const { data, loading } = useQuery(GET_AUDIT, {
    variables: { companyId: selectedCompany?.id ?? '', entityType: entityType || undefined },
    skip: !selectedCompany,
  });

  const { data: integrityData, loading: integrityLoading, refetch: recheck } = useQuery(VERIFY_INTEGRITY, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const entries = data?.auditTrail ?? [];
  const integrity = integrityData?.verifyAuditIntegrity;

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver a trilha de auditoria.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trilha de Auditoria</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Hash chain SHA-256 imutável</p>
        </div>
        <button
          onClick={() => recheck()}
          disabled={integrityLoading}
          className="btn-ghost flex items-center gap-2"
        >
          {integrityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Verificar Integridade
        </button>
      </div>

      {/* Integrity Status */}
      {integrity && (
        <div className={`flex items-start gap-4 rounded-xl p-5 border ${
          integrity.valid
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          {integrity.valid
            ? <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            : <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />}
          <div>
            <p className={`font-medium text-sm ${integrity.valid ? 'text-green-400' : 'text-red-400'}`}>
              {integrity.valid ? 'Integridade verificada — cadeia de hashes íntegra' : 'Falha de integridade detectada'}
            </p>
            {!integrity.valid && integrity.invalidEntries.length > 0 && (
              <div className="mt-2 space-y-0.5">
                <p className="text-red-300 text-xs">Entradas corrompidas:</p>
                {integrity.invalidEntries.map((id: string) => (
                  <p key={id} className="text-red-400 text-xs font-mono">{id}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-gray-500" />
        <div className="flex gap-2 flex-wrap">
          {ENTITY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setEntityType(t.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                entityType === t.value
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                  : 'border-[#1e2740] text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-gray-600 text-xs ml-auto">{entries.length} registros</span>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card-aura text-center py-16">
          <Hash className="h-12 w-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Nenhum registro de auditoria encontrado.</p>
          <p className="text-gray-600 text-xs mt-1">As ações do sistema serão registradas aqui automaticamente.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: any) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
