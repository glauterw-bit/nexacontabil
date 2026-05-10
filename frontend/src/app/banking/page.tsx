'use client';
import { useState } from 'react';
import { Plus, RefreshCw, Upload, CheckCircle, Clock, TrendingUp, TrendingDown, X, Landmark } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface ContaBancaria {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: string;
  saldo: number;
  ultimaSync: string;
  ativo: boolean;
}

interface Transacao {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: 'debito' | 'credito';
  saldoApos: number;
  reconciliado: boolean;
  contaId: string;
}

const MOCK_CONTAS: ContaBancaria[] = [
  { id: '1', banco: 'Itaú Unibanco', agencia: '0234', conta: '12345-6', tipo: 'Conta Corrente', saldo: 142800, ultimaSync: '2026-03-23T08:30:00', ativo: true },
  { id: '2', banco: 'Bradesco', agencia: '1234', conta: '98765-4', tipo: 'Conta Poupança', saldo: 85200, ultimaSync: '2026-03-23T08:30:00', ativo: true },
  { id: '3', banco: 'Banco do Brasil', agencia: '4567', conta: '11223-3', tipo: 'Conta Corrente', saldo: 32400, ultimaSync: '2026-03-22T17:00:00', ativo: true },
];

const MOCK_TRANSACOES: Transacao[] = [
  { id: '1', data: '2026-03-23', descricao: 'PAGTO FORNECEDOR ABC LTDA', valor: -8500, tipo: 'debito', saldoApos: 142800, reconciliado: true, contaId: '1' },
  { id: '2', data: '2026-03-22', descricao: 'TED RECEBIDA - CLIENTE XYZ', valor: 15800, tipo: 'credito', saldoApos: 151300, reconciliado: true, contaId: '1' },
  { id: '3', data: '2026-03-22', descricao: 'PAGTO FATURA CARTÃO', valor: -3200, tipo: 'debito', saldoApos: 135500, reconciliado: true, contaId: '1' },
  { id: '4', data: '2026-03-21', descricao: 'DOC RECEBIDO - TECH SOLUTIONS', valor: 9500, tipo: 'credito', saldoApos: 138700, reconciliado: false, contaId: '1' },
  { id: '5', data: '2026-03-20', descricao: 'PAGTO DAS SIMPLES NACIONAL', valor: -4820.50, tipo: 'debito', saldoApos: 129200, reconciliado: true, contaId: '1' },
  { id: '6', data: '2026-03-19', descricao: 'PAGTO ALUGUEL ESCRITÓRIO', valor: -4500, tipo: 'debito', saldoApos: 134020.50, reconciliado: true, contaId: '1' },
  { id: '7', data: '2026-03-18', descricao: 'TED RECEBIDA - COMÉRCIO BETA', valor: 3200, tipo: 'credito', saldoApos: 138520.50, reconciliado: false, contaId: '1' },
  { id: '8', data: '2026-03-18', descricao: 'PAGTO GPS INSS', valor: -3150.75, tipo: 'debito', saldoApos: 135320.50, reconciliado: true, contaId: '1' },
  { id: '9', data: '2026-03-15', descricao: 'PAGTO SALÁRIOS FUNCIONÁRIOS', valor: -29046.42, tipo: 'debito', saldoApos: 138471.25, reconciliado: true, contaId: '1' },
  { id: '10', data: '2026-03-10', descricao: 'JUROS APLICAÇÃO FINANCEIRA', valor: 892.15, tipo: 'credito', saldoApos: 167517.67, reconciliado: true, contaId: '1' },
];

const BANCOS_DISPONIVEIS = ['Itaú Unibanco', 'Bradesco', 'Banco do Brasil', 'Santander', 'Caixa Econômica', 'Nubank', 'BTG Pactual', 'Sicoob', 'Inter'];

export default function BankingPage() {
  const { selectedCompany } = useCompany();
  const [contas, setContas] = useState<ContaBancaria[]>(MOCK_CONTAS);
  const [transacoes, setTransacoes] = useState<Transacao[]>(MOCK_TRANSACOES);
  const [contaSelecionada, setContaSelecionada] = useState('1');
  const [showConectar, setShowConectar] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const sincronizar = async (id: string) => {
    setSyncing(id);
    await new Promise(r => setTimeout(r, 1500));
    setContas(prev => prev.map(c => c.id === id ? { ...c, ultimaSync: new Date().toISOString() } : c));
    setSyncing(null);
  };

  const reconciliar = (id: string) => {
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, reconciliado: true } : t));
  };

  const txConta = transacoes.filter(t => t.contaId === contaSelecionada);
  const contaAtual = contas.find(c => c.id === contaSelecionada);
  const saldoTotal = contas.reduce((s, c) => s + c.saldo, 0);
  const pendentesRec = transacoes.filter(t => !t.reconciliado).length;

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para acessar o Open Finance.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Open Finance — Extrato Bancário</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Saldo consolidado: <span className="text-green-400 font-semibold">{saldoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost text-sm border border-[#1e2740]"><Upload className="h-4 w-4" />Importar CSV</button>
          <button onClick={() => setShowConectar(true)} className="btn-primary"><Plus className="h-4 w-4" />Conectar Banco</button>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {contas.map(c => (
          <button key={c.id} onClick={() => setContaSelecionada(c.id)}
            className={`card-aura text-left transition-all ${contaSelecionada === c.id ? 'border-indigo-500/50 bg-indigo-600/5' : 'hover:border-indigo-500/30'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <Landmark className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{c.banco}</p>
                  <p className="text-gray-500 text-xs">Ag {c.agencia} · CC {c.conta}</p>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); sincronizar(c.id); }}
                className="btn-ghost p-1.5" title="Sincronizar">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing === c.id ? 'animate-spin text-indigo-400' : 'text-gray-500'}`} />
              </button>
            </div>
            <p className={`text-xl font-bold font-mono ${c.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {c.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">{c.tipo} · Sync: {new Date(c.ultimaSync).toLocaleString('pt-BR')}</p>
          </button>
        ))}
      </div>

      {/* Statement */}
      <div className="card-aura">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-white">
            Extrato — {contaAtual?.banco}
            {pendentesRec > 0 && (
              <span className="ml-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                {pendentesRec} a reconciliar
              </span>
            )}
          </h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
              <th className="pb-3 font-medium">Data</th>
              <th className="pb-3 font-medium">Descrição</th>
              <th className="pb-3 font-medium text-right">Valor</th>
              <th className="pb-3 font-medium text-right">Saldo</th>
              <th className="pb-3 font-medium text-center">Reconc.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2740]">
            {txConta.map(t => (
              <tr key={t.id} className="hover:bg-white/5 transition-colors">
                <td className="py-3 text-sm text-gray-400">{new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="py-3 text-sm text-white max-w-xs truncate">{t.descricao}</td>
                <td className="py-3 text-sm text-right font-mono">
                  <span className={`flex items-center justify-end gap-1 ${t.tipo === 'credito' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.tipo === 'credito' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {t.tipo === 'credito' ? '+' : '-'}
                    {Math.abs(t.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </td>
                <td className="py-3 text-sm text-right font-mono text-gray-300">
                  {t.saldoApos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="py-3 text-center">
                  {t.reconciliado ? (
                    <CheckCircle className="h-4 w-4 text-green-400 mx-auto" />
                  ) : (
                    <button onClick={() => reconciliar(t.id)} className="btn-ghost p-1 text-yellow-400 hover:text-yellow-300" title="Reconciliar">
                      <Clock className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Conectar Banco Modal */}
      {showConectar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Conectar Banco</h2>
              <button onClick={() => setShowConectar(false)} className="btn-ghost p-1.5"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-gray-400 text-sm">Selecione o banco para iniciar a conexão Open Finance (LGPD-compliant).</p>
            <div className="grid grid-cols-3 gap-2">
              {BANCOS_DISPONIVEIS.map(banco => (
                <button key={banco} onClick={() => setShowConectar(false)}
                  className="p-3 bg-[#161b2e] border border-[#1e2740] rounded-lg text-gray-300 text-xs hover:border-indigo-500/50 hover:text-white transition-colors text-center">
                  {banco}
                </button>
              ))}
            </div>
            <button onClick={() => setShowConectar(false)} className="btn-ghost w-full">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
