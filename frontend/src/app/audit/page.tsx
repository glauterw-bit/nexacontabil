'use client';
import { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import {
  ShieldCheck, AlertTriangle, Loader2, Building2,
  Bot, User, Hash, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Filter
} from 'lucide-react';
import { PageHeader, Spinner, EmptyState, COLORS, tint } from '@/components/ui/kit';

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

function actionStyle(action: string) {
  const cor =
    action.includes('create') || action.includes('CREATE') ? COLORS.ok
    : action.includes('update') || action.includes('UPDATE') ? COLORS.info
    : action.includes('delete') || action.includes('DELETE') || action.includes('deactivate') ? COLORS.erro
    : action.includes('approve') || action.includes('APPROVE') ? COLORS.atencao
    : COLORS.muted;
  return { color: cor, background: tint(cor, 10), border: `1px solid ${tint(cor, 20)}` };
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
    <div className="card-aura !p-0 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 p-4 hover:bg-inset transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-lg bg-inset flex items-center justify-center flex-shrink-0">
          {entry.performedBy.startsWith('agent:') || entry.agentType
            ? <Bot className="h-4 w-4 text-tx-muted" />
            : <User className="h-4 w-4 text-tx-muted" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={actionStyle(entry.action)}>
              {entry.action}
            </span>
            <span className="text-tx-muted text-xs">{entry.entityType}</span>
            <span className="text-tx-faint text-xs font-mono truncate">{entry.entityId.slice(0, 8)}…</span>
          </div>
          <p className="text-tx-muted text-xs mt-0.5">
            {entry.performedBy.replace('agent:', '')}
            {entry.agentType && <span className="text-tx-muted"> · {entry.agentType}</span>}
          </p>
        </div>
        <span className="text-tx-faint text-xs flex-shrink-0">{ago(entry.createdAt)}</span>
        {open ? <ChevronDown className="h-4 w-4 text-tx-muted flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-tx-muted flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-line p-4 bg-inset space-y-4 text-xs">
          {/* Hash chain */}
          <div className="space-y-1.5">
            <p className="text-tx-muted uppercase tracking-wider text-xs">Hash Chain (SHA-256)</p>
            <div className="font-mono text-tx-muted space-y-1 bg-page rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-tx-faint w-14 flex-shrink-0">anterior:</span>
                <span className="break-all text-tx-muted">{entry.previousHash || '(genesis)'}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-tx-faint w-14 flex-shrink-0">atual:</span>
                <span className="break-all text-tx-strong">{entry.currentHash}</span>
              </div>
            </div>
          </div>

          {/* Values */}
          {(entry.oldValues || entry.newValues) && (
            <div className="grid grid-cols-2 gap-3">
              {entry.oldValues && (
                <div>
                  <p className="text-tx-muted mb-1.5">Valores anteriores</p>
                  <pre className="rounded-lg p-3 text-err overflow-auto max-h-32 text-xs" style={{ background: tint(COLORS.erro, 5), border: `1px solid ${tint(COLORS.erro, 10)}` }}>
                    {JSON.stringify(entry.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {entry.newValues && (
                <div>
                  <p className="text-tx-muted mb-1.5">Novos valores</p>
                  <pre className="rounded-lg p-3 text-ok overflow-auto max-h-32 text-xs" style={{ background: tint(COLORS.ok, 5), border: `1px solid ${tint(COLORS.ok, 10)}` }}>
                    {JSON.stringify(entry.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {entry.metadata && (
            <div>
              <p className="text-tx-muted mb-1.5">Metadados</p>
              <pre className="bg-page border border-line rounded-lg p-3 text-tx-muted overflow-auto max-h-32 text-xs">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          <div className="text-tx-faint text-xs">
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa" sub="Escolha uma empresa para ver a trilha de auditoria." />
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<ShieldCheck size={22} color={COLORS.acao} />}
        title="Trilha de Auditoria"
        subtitle={`${selectedCompany.name} · Hash chain SHA-256 imutável`}
        action={
          <button
            onClick={() => recheck()}
            disabled={integrityLoading}
            className="btn-secondary"
          >
            {integrityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verificar Integridade
          </button>
        }
      />

      {/* Integrity Status */}
      {integrity && (
        <div className="flex items-start gap-4 rounded-xl p-5"
          style={integrity.valid
            ? { background: tint(COLORS.ok, 10), border: `1px solid ${tint(COLORS.ok, 20)}` }
            : { background: tint(COLORS.erro, 10), border: `1px solid ${tint(COLORS.erro, 20)}` }}>
          {integrity.valid
            ? <CheckCircle2 className="h-5 w-5 text-ok flex-shrink-0 mt-0.5" />
            : <XCircle className="h-5 w-5 text-err flex-shrink-0 mt-0.5" />}
          <div>
            <p className={`font-medium text-sm ${integrity.valid ? 'text-ok' : 'text-err'}`}>
              {integrity.valid ? 'Integridade verificada — cadeia de hashes íntegra' : 'Falha de integridade detectada'}
            </p>
            {!integrity.valid && integrity.invalidEntries.length > 0 && (
              <div className="mt-2 space-y-0.5">
                <p className="text-err text-xs">Entradas corrompidas:</p>
                {integrity.invalidEntries.map((id: string) => (
                  <p key={id} className="text-err text-xs font-mono">{id}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-tx-muted" />
        <div className="flex gap-2 flex-wrap">
          {ENTITY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setEntityType(t.value)}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={entityType === t.value
                ? { background: tint(COLORS.acao, 12), borderColor: COLORS.acao, color: COLORS.acao }
                : { borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-tx-faint text-xs ml-auto">{entries.length} registros</span>
      </div>

      {/* Entries */}
      {loading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <div className="card-aura">
          <EmptyState
            icon={<Hash size={40} />}
            title="Nenhum registro de auditoria encontrado."
            sub="As ações do sistema serão registradas aqui automaticamente."
          />
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
