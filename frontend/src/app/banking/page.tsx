'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import {
  Plus, RefreshCw, CheckCircle, Clock, TrendingUp, TrendingDown, X,
  Landmark, Loader2, AlertCircle,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Kpi, StatusChip, Spinner, EmptyState, COLORS } from '@/components/ui/kit';

const LIST_CONNECTIONS = gql`
  query BankConnections($companyId: String!) {
    bankConnections(companyId: $companyId) {
      id companyId bankName bankCode status accountType lastSyncAt
      statements { id date description amount type balance reconciled }
    }
  }
`;

const CREATE_CONNECTION = gql`
  mutation CreateBankConnection($input: CreateBankConnectionInput!) {
    createBankConnection(input: $input) {
      id bankName bankCode status
    }
  }
`;

const SYNC_BANK = gql`
  mutation SyncBank($id: String!) {
    syncBankStatements(connectionId: $id) {
      connectionId syncedCount lastSyncAt
    }
  }
`;

const BANCOS = [
  { name: 'Itaú Unibanco', code: '341' },
  { name: 'Bradesco', code: '237' },
  { name: 'Banco do Brasil', code: '001' },
  { name: 'Santander', code: '033' },
  { name: 'Caixa Econômica', code: '104' },
  { name: 'Banco Inter', code: '077' },
  { name: 'Nubank', code: '260' },
  { name: 'BTG Pactual', code: '208' },
  { name: 'Sicoob', code: '756' },
  { name: 'Sicredi', code: '748' },
];

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BankingPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [showConectar, setShowConectar] = useState(false);
  const [contaSel, setContaSel] = useState<string | null>(null);

  const companyId = selectedCompany?.id ?? '';
  const { data, loading, refetch } = useQuery(LIST_CONNECTIONS, {
    variables: { companyId },
    skip: !companyId,
  });

  const [createConn, { loading: creating }] = useMutation(CREATE_CONNECTION, {
    onCompleted: () => { toast.push('Conta conectada', { variant: 'success' }); setShowConectar(false); refetch(); },
    onError: (e) => toast.push(e.message, { variant: 'error', title: 'Erro' }),
  });
  const [syncMutation] = useMutation(SYNC_BANK, {
    onCompleted: (d) => {
      toast.push(`${d.syncBankStatements.syncedCount} lançamentos sincronizados`, { variant: 'success' });
      refetch();
    },
    onError: (e) => toast.push(e.message, { variant: 'error', title: 'Erro' }),
  });
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const conexoes: any[] = data?.bankConnections ?? [];
  const conexaoAtual = conexoes.find((c) => c.id === contaSel) ?? conexoes[0] ?? null;
  const statements: any[] = conexaoAtual?.statements ?? [];

  const saldoTotal = conexoes.reduce((s, c) => {
    const last = (c.statements ?? []).slice(-1)[0];
    return s + (last?.balance ?? 0);
  }, 0);
  const pendentesRec = conexoes.reduce(
    (n, c) => n + (c.statements ?? []).filter((t: any) => !t.reconciled).length, 0
  );

  async function sincronizar(id: string) {
    setSyncingId(id);
    try { await syncMutation({ variables: { id } }); } finally { setSyncingId(null); }
  }

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa" sub="Escolha uma empresa para acessar o Open Finance." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Landmark size={22} color={COLORS.acao} />}
        title="Open Finance"
        subtitle={selectedCompany.name}
        action={
          <button onClick={() => setShowConectar(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Conectar conta bancária
          </button>
        }
      />

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        <Kpi label="Contas conectadas" value={String(conexoes.length)} />
        <Kpi label="Saldo consolidado" value={brl(saldoTotal)} cor={COLORS.ok} />
        <Kpi label="Lançamentos pendentes" value={String(pendentesRec)} cor={pendentesRec > 0 ? COLORS.atencao : COLORS.ok} />
        <Kpi
          label="Última sincronização"
          value={
            conexaoAtual?.lastSyncAt
              ? new Date(conexaoAtual.lastSyncAt).toLocaleDateString('pt-BR')
              : '—'
          }
        />
      </div>

      {loading && conexoes.length === 0 ? (
        <Spinner />
      ) : conexoes.length === 0 ? (
        <div className="card-aura text-center">
          <EmptyState
            icon={<Landmark size={40} />}
            title="Nenhuma conta bancária conectada"
            sub="Conecte a primeira conta para que o sistema importe extratos automaticamente. Quando o Pluggy estiver configurado em Integrações, a importação roda diariamente."
          />
          <button onClick={() => setShowConectar(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Conectar conta
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tabs de contas */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {conexoes.map((c) => (
              <button
                key={c.id}
                onClick={() => setContaSel(c.id)}
                className="px-3 py-2 text-xs font-medium border rounded-lg whitespace-nowrap transition-colors"
                style={
                  conexaoAtual?.id === c.id
                    ? { background: 'color-mix(in srgb, var(--acao) 12%, transparent)', color: 'var(--acao)', borderColor: 'var(--acao)' }
                    : { background: 'var(--surface)', color: 'var(--tx)', borderColor: 'var(--border)' }
                }
              >
                <Landmark className="h-3.5 w-3.5 inline mr-1.5" />
                {c.bankName}
                <span className="ml-2 text-[10px] text-tx-muted">{c.bankCode}</span>
              </button>
            ))}
          </div>

          {/* Header da conta selecionada */}
          {conexaoAtual && (
            <div className="card-aura">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[13px] font-medium text-tx-strong">{conexaoAtual.bankName}</p>
                  <p className="text-xs text-tx-muted">
                    {conexaoAtual.accountType || 'Conta corrente'} · status: {conexaoAtual.status}
                  </p>
                </div>
                <button
                  onClick={() => sincronizar(conexaoAtual.id)}
                  disabled={syncingId === conexaoAtual.id}
                  className="btn-secondary text-xs"
                >
                  {syncingId === conexaoAtual.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sincronizar
                </button>
              </div>

              {statements.length === 0 ? (
                <EmptyState
                  icon={<Landmark size={32} />}
                  title="Nenhum extrato sincronizado ainda"
                  sub="Clique em Sincronizar para buscar os últimos lançamentos."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-aura">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th className="num">Valor</th>
                        <th className="num">Saldo</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...statements].reverse().map((t) => (
                        <tr key={t.id}>
                          <td className="text-xs text-tx-muted">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                          <td>{t.description}</td>
                          <td className="num">
                            <span className={t.amount >= 0 ? 'text-ok' : 'text-err'}>
                              {t.amount >= 0 ? '+' : ''}{brl(t.amount)}
                            </span>
                          </td>
                          <td className="num text-tx-muted">
                            {t.balance != null ? brl(t.balance) : '—'}
                          </td>
                          <td className="text-center">
                            {t.reconciled ? (
                              <StatusChip tone="ok" label="Conciliado" size="sm" />
                            ) : (
                              <StatusChip tone="atencao" label="Pendente" size="sm" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showConectar && (
        <ConnectModal
          companyId={companyId}
          onClose={() => setShowConectar(false)}
          onSubmit={(input) => createConn({ variables: { input } })}
          submitting={creating}
        />
      )}
    </div>
  );
}

function ConnectModal({
  companyId, onClose, onSubmit, submitting,
}: {
  companyId: string;
  onClose: () => void;
  onSubmit: (input: any) => void;
  submitting: boolean;
}) {
  const [bankCode, setBankCode] = useState(BANCOS[0].code);
  const [accountType, setAccountType] = useState('Conta Corrente');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = BANCOS.find((x) => x.code === bankCode);
    onSubmit({
      companyId,
      bankName: b?.name ?? bankCode,
      bankCode,
      accountType,
    });
  }

  return (
    <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-card border border-line rounded-xl shadow-pop p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-tx-strong">Conectar conta bancária</h2>
            <p className="text-xs text-tx-muted mt-1">Para sincronização automática real, configure Pluggy em Integrações.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs text-tx-muted mb-1">Banco</span>
          <select
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="input-aura w-full"
          >
            {BANCOS.map((b) => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-tx-muted mb-1">Tipo de conta</span>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="input-aura w-full"
          >
            <option>Conta Corrente</option>
            <option>Conta Poupança</option>
            <option>Conta Pagamento</option>
          </select>
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-tx hover:text-tx-strong bg-inset border border-line rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg inline-flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Conectar
          </button>
        </div>
      </form>
    </div>
  );
}
