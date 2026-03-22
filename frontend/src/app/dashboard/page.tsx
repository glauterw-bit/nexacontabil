'use client';
import { useState } from 'react';
import { MetricCard } from '@/components/charts/MetricCard';
import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { DocumentsQueue } from '@/components/layout/DocumentsQueue';
import { AgentActivity } from '@/components/layout/AgentActivity';
import {
  FileText, TrendingUp, AlertTriangle, CheckCircle, Brain
} from 'lucide-react';

const MOCK_METRICS = [
  { label: 'Documentos Processados', value: '1.247', delta: '+12%', icon: FileText, color: 'blue' },
  { label: 'Precisão do IDP', value: '99.1%', delta: '+0.3%', icon: CheckCircle, color: 'green' },
  { label: 'Alertas Pendentes', value: '8', delta: '-3', icon: AlertTriangle, color: 'yellow' },
  { label: 'Economia Tributária', value: 'R$ 42.800', delta: '+R$ 8.200', icon: TrendingUp, color: 'purple' },
];

export default function DashboardPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Centro de inteligência contábil — Aura Accounting
          </p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {/* AI Status Banner */}
      <div className="flex items-center gap-3 bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
        <Brain className="h-5 w-5 text-brand-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-white">5 Agentes Ativos</p>
          <p className="text-xs text-gray-400">
            Supervisor · Tax Agent · Accounting Agent · Compliance Agent · Audit Agent — todos operacionais
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">Online</span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {MOCK_METRICS.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Charts + Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <CashFlowChart period={period} />
        </div>
        <div>
          <DocumentsQueue />
        </div>
      </div>

      {/* Agent Activity */}
      <AgentActivity />
    </div>
  );
}
