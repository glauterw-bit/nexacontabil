'use client';
import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { MetricCard } from '@/components/charts/MetricCard';
import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { DocumentsQueue } from '@/components/layout/DocumentsQueue';
import { AgentActivity } from '@/components/layout/AgentActivity';
import { FileText, TrendingUp, AlertTriangle, CheckCircle, Brain, Building2, Flag, DollarSign, HeartPulse, Clock, Bell } from 'lucide-react';
import Link from 'next/link';

const GET_EXTRAS = gql`
  query GetDashboardExtras($companyId: String!) {
    tarefasResumo(companyId: $companyId) { total emAndamento atrasadas }
    honorariosResumo(companyId: $companyId) { totalAtrasado totalPendente vencendoHoje }
    notifications(companyId: $companyId) { id titulo corpo tipo lida link createdAt }
    notificacoesNaoLidas(companyId: $companyId)
  }
`;

const GET_STATS = gql`
  query GetDocumentStats($companyId: String!) {
    documentStats(companyId: $companyId) {
      total
      pending
      completed
      failed
      totalValue
    }
  }
`;

export default function DashboardPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const { selectedCompany } = useCompany();

  const { data, loading } = useQuery(GET_STATS, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const { data: extras } = useQuery(GET_EXTRAS, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
    pollInterval: 60000,
  });

  const stats = data?.documentStats;
  const tarefasRes = extras?.tarefasResumo;
  const honorariosRes = extras?.honorariosResumo;
  const notificacoes: any[] = extras?.notifications ?? [];
  const naoLidas: number = extras?.notificacoesNaoLidas ?? 0;

  // Score de Saúde: heurística baseada em pendências
  const calcHealthScore = () => {
    let score = 100;
    if (tarefasRes?.atrasadas) score -= tarefasRes.atrasadas * 5;
    if (honorariosRes?.totalAtrasado > 0) score -= 15;
    if (stats?.failed) score -= stats.failed * 3;
    if (stats?.pending > 5) score -= 10;
    return Math.max(0, Math.min(100, score));
  };
  const healthScore = selectedCompany ? calcHealthScore() : 0;
  const healthColor = healthScore >= 80 ? 'text-green-400' : healthScore >= 60 ? 'text-yellow-400' : 'text-red-400';
  const healthBg = healthScore >= 80 ? 'bg-green-500' : healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  const accuracy = stats?.completed && stats?.total
    ? ((stats.completed / stats.total) * 100).toFixed(1) + '%'
    : '—';

  const metrics = [
    {
      label: 'Documentos Processados',
      value: loading ? '...' : (stats?.total ?? 0).toLocaleString('pt-BR'),
      delta: stats?.completed ? `${stats.completed} concluídos` : '0 concluídos',
      icon: FileText,
      color: 'blue' as const,
    },
    {
      label: 'Precisão do IDP',
      value: loading ? '...' : accuracy,
      delta: stats?.failed ? `${stats.failed} falhas` : 'sem falhas',
      icon: CheckCircle,
      color: 'green' as const,
    },
    {
      label: 'Pendentes de Revisão',
      value: loading ? '...' : (stats?.pending ?? 0).toString(),
      delta: stats?.pending ? 'aguardando aprovação' : 'tudo em dia',
      icon: AlertTriangle,
      color: 'yellow' as const,
    },
    {
      label: 'Volume Processado',
      value: loading ? '...' : `R$ ${Number(stats?.totalValue ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`,
      delta: 'total acumulado',
      icon: TrendingUp,
      color: 'purple' as const,
    },
  ];

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
        <div className="h-16 w-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-indigo-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Nenhuma empresa selecionada</h2>
          <p className="text-gray-400 text-sm mb-6">Cadastre um cliente para começar a usar o sistema</p>
          <Link href="/companies" className="btn-primary">
            <Building2 className="h-4 w-4" />
            Cadastrar empresa
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{selectedCompany.name}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {selectedCompany.taxRegime.replace(/_/g, ' ')} · CNPJ {selectedCompany.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
          </p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {/* AI Status Banner */}
      <div className="flex items-center gap-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4">
        <Brain className="h-5 w-5 text-indigo-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-white">5 Agentes de IA Ativos</p>
          <p className="text-xs text-gray-400">
            Supervisor · Tax Agent · Accounting Agent · Compliance Agent · Audit Agent
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">Online</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Charts + Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <CashFlowChart period={period} />
        </div>
        <DocumentsQueue companyId={selectedCompany.id} />
      </div>

      {/* Agent Activity */}
      <AgentActivity />

      {/* Inovação: Score de Saúde + Alertas + Notificações */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Score de Saúde do Cliente */}
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <HeartPulse className="h-4 w-4 text-pink-400" />
            <h3 className="text-sm font-semibold text-white">Score de Saúde</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 flex-shrink-0">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e2740" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#eab308' : '#ef4444'}
                  strokeWidth="3" strokeDasharray={`${healthScore} 100`} strokeLinecap="round" />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${healthColor}`}>
                {healthScore}
              </span>
            </div>
            <div className="space-y-1.5 flex-1">
              {tarefasRes?.atrasadas > 0 && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <Flag className="h-3 w-3" />{tarefasRes.atrasadas} tarefa(s) atrasada(s)
                </p>
              )}
              {honorariosRes?.totalAtrasado > 0 && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" />Honorário em atraso
                </p>
              )}
              {tarefasRes?.atrasadas === 0 && honorariosRes?.totalAtrasado === 0 && (
                <p className="text-xs text-green-400">Tudo em dia!</p>
              )}
              <p className="text-xs text-gray-600 mt-2">
                {healthScore >= 80 ? 'Excelente' : healthScore >= 60 ? 'Atenção necessária' : 'Crítico'}
              </p>
            </div>
          </div>
          <div className="mt-4 h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${healthBg}`} style={{ width: `${healthScore}%` }} />
          </div>
        </div>

        {/* Tarefas e Honorários */}
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-400" /> Pendências do Dia
          </h3>
          <div className="space-y-3">
            <Link href="/tarefas" className="flex items-center justify-between p-3 bg-[#0f1117] rounded-lg hover:bg-white/3 transition-colors group">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-indigo-400" />
                <div>
                  <p className="text-xs font-medium text-white">Tarefas em andamento</p>
                  <p className="text-xs text-gray-500">{tarefasRes?.atrasadas ?? 0} atrasadas</p>
                </div>
              </div>
              <span className="text-xl font-bold text-indigo-400">{tarefasRes?.emAndamento ?? 0}</span>
            </Link>
            <Link href="/honorarios" className="flex items-center justify-between p-3 bg-[#0f1117] rounded-lg hover:bg-white/3 transition-colors group">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-yellow-400" />
                <div>
                  <p className="text-xs font-medium text-white">Honorários pendentes</p>
                  <p className="text-xs text-gray-500">{honorariosRes?.vencendoHoje ?? 0} vencendo hoje</p>
                </div>
              </div>
              <span className="text-sm font-bold text-yellow-400">
                R$ {(honorariosRes?.totalPendente ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </span>
            </Link>
          </div>
        </div>

        {/* Notificações recentes */}
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Notificações</h3>
            {naoLidas > 0 && (
              <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
                <Bell className="h-3 w-3" />{naoLidas}
              </span>
            )}
          </div>
          {notificacoes.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-6">Sem notificações</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {notificacoes.slice(0, 6).map((n: any) => (
                <div key={n.id} className={`p-2.5 rounded-lg border text-xs transition-colors ${n.lida ? 'border-[#1e2740] bg-transparent' : 'border-indigo-500/20 bg-indigo-600/5'}`}>
                  <p className={`font-medium ${n.lida ? 'text-gray-400' : 'text-white'}`}>{n.titulo}</p>
                  <p className="text-gray-600 mt-0.5">{n.corpo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
