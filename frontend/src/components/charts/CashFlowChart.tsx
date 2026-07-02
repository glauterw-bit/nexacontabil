'use client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const MOCK_DATA_30D = [
  { date: '01/03', receitas: 45000, despesas: 32000 },
  { date: '05/03', receitas: 52000, despesas: 28000 },
  { date: '10/03', receitas: 38000, despesas: 41000 },
  { date: '15/03', receitas: 67000, despesas: 35000 },
  { date: '20/03', receitas: 73000, despesas: 29000 },
  { date: '25/03', receitas: 55000, despesas: 38000 },
  { date: '30/03', receitas: 81000, despesas: 44000 },
];

const fmt = (v: number) =>
  `R$ ${(v / 1000).toFixed(0)}k`;

interface Props { period: '7d' | '30d' | '90d' }

export function CashFlowChart({ period }: Props) {
  return (
    <div className="card-aura">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Fluxo de Caixa</h2>
        <span className="text-xs text-gray-400 bg-surface px-2 py-1 rounded-lg">{period}</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={MOCK_DATA_30D} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f6ef7" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#4f6ef7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: 'var(--faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--tx)' }}
            formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
          <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#4f6ef7" fill="url(#colorReceitas)" strokeWidth={2} />
          <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#ef4444" fill="url(#colorDespesas)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
