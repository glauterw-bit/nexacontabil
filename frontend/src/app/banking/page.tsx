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
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para acessar o Open Finance.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
          Gerenciar Empresas
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Open Finance</h1>
          <p className="text-gray-400 text-sm mt-0.5">{selectedCompany.name}</p>
        </div>
        <button
          onClick={() => setShowConectar(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
        >
          <Plus className="h-3.5 w-3.5" />
          Conectar conta bancária
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Contas conectadas" value={String(conexoes.length)} />
        <SummaryCard label="Saldo consolidado" value={brl(saldoTotal)} highlight />
        <SummaryCard label="Lançamentos pendentes" value={String(pendentesRec)} color={pendentesRec > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <SummaryCard
          label="Última sincronização"
          value={
            conexaoAtual?.lastSyncAt
              ? new Date(conexaoAtual.lastSyncAt).toLocaleDateString('pt-BR')
              : '—'
          }
          small
        />
      </div>

      {loading && conexoes.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : conexoes.length === 0 ? (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <Landmark className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Nenhuma conta bancária conectada</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Conecte a primeira conta para que o sistema importe extratos automaticamente. Quando o
            Pluggy estiver configurado em Integrações, a importação roda diariamente.
          </p>
          <button
            onClick={() => setShowConectar(true)}
            className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" />
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
                className={`px-3 py-2 text-xs font-medium border rounded-lg whitespace-nowrap transition-colors ${
                  conexaoAtual?.id === c.id
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-[#161b2e] text-gray-300 border-[#1e2740] hover:border-indigo-500/30'
                }`}
              >
                <Landmark className="h-3.5 w-3.5 inline mr-1.5" />
                {c.bankName}
                <span className="ml-2 text-[10px] text-gray-500">{c.bankCode}</span>
              </button>
            ))}
          </div>

          {/* Header da conta selecionada */}
          {conexaoAtual && (
            <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-white">{conexaoAtual.bankName}</p>
                  <p className="text-xs text-gray-500">
                    {conexaoAtual.accountType || 'Conta corrente'} · status: {conexaoAtual.status}
                  </p>
                </div>
                <button
                  onClick={() => sincronizar(conexaoAtual.id)}
                  disabled={syncingId === conexaoAtual.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1e2740] hover:bg-[#2a3550] text-white rounded-lg disabled:opacity-50"
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
                <div className="text-center py-8 text-sm text-gray-500">
                  Nenhum extrato sincronizado ainda. Clique em <strong>Sincronizar</strong> para
                  buscar os últimos lançamentos.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                        <th className="pb-3 font-medium">Data</th>
                        <th className="pb-3 font-medium">Descrição</th>
                        <th className="pb-3 font-medium text-right">Valor</th>
                        <th className="pb-3 font-medium text-right">Saldo</th>
                        <th className="pb-3 font-medium text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2740]">
                      {[...statements].reverse().map((t) => (
                        <tr key={t.id} className="hover:bg-white/5">
                          <td className="py-2.5 text-xs text-gray-400">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                          <td className="py-2.5 text-gray-200">{t.description}</td>
                          <td className="py-2.5 text-right font-mono">
                            <span className={t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {t.amount >= 0 ? '+' : ''}{brl(t.amount)}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono text-gray-400">
                            {t.balance != null ? brl(t.balance) : '—'}
                          </td>
                          <td className="py-2.5 text-center">
                            {t.reconciled ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                <CheckCircle className="h-3 w-3" /> Conciliado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                                <Clock className="h-3 w-3" /> Pendente
                              </span>
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

function SummaryCard({
  label, value, hint, highlight, color, small,
}: {
  label: string; value: string; hint?: string; highlight?: boolean; color?: string; small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-bold ${small ? 'text-base' : 'text-lg'} ${color ?? (highlight ? 'text-emerald-400' : 'text-white')}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Conectar conta bancária</h2>
            <p className="text-xs text-gray-500 mt-1">Para sincronização automática real, configure Pluggy em Integrações.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Banco</span>
          <select
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
          >
            {BANCOS.map((b) => (
              <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">Tipo de conta</span>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
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
            className="flex-1 px-4 py-2 text-sm text-gray-300 bg-[#1e2740] hover:bg-[#2a3550] rounded-lg"
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
