'use client';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Brain, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface Dimensao {
  nome: string;
  score: number;
  peso: number;
  alertas: string[];
}

const DIMENSOES: Dimensao[] = [
  { nome: 'Conformidade Fiscal', score: 88, peso: 0.25, alertas: [] },
  { nome: 'Pontualidade Tributária', score: 72, peso: 0.20, alertas: ['IRRF de Fev/2026 em atraso — regularizar imediatamente'] },
  { nome: 'Saúde Financeira', score: 81, peso: 0.20, alertas: [] },
  { nome: 'Gestão Trabalhista', score: 90, peso: 0.15, alertas: [] },
  { nome: 'Qualidade Contábil', score: 85, peso: 0.10, alertas: [] },
  { nome: 'Planejamento Fiscal', score: 62, peso: 0.10, alertas: ['Sem planejamento tributário para 2026', 'Regime fiscal não revisado há 3 anos'] },
];

const HISTORICO = [
  { mes: 'Out', score: 71 },
  { mes: 'Nov', score: 74 },
  { mes: 'Dez', score: 78 },
  { mes: 'Jan', score: 76 },
  { mes: 'Fev', score: 79 },
  { mes: 'Mar', score: 80 },
];

const TODOS_ALERTAS = [
  { tipo: 'erro', msg: 'IRRF de Fevereiro/2026 em atraso — DARF não recolhida', prioridade: 'alta' },
  { tipo: 'warning', msg: 'Planejamento tributário 2026 não elaborado', prioridade: 'media' },
  { tipo: 'warning', msg: 'Regime fiscal não revisado desde 2023', prioridade: 'media' },
  { tipo: 'info', msg: 'Lucros acumulados superiores a R$ 100k — avaliar distribuição', prioridade: 'baixa' },
  { tipo: 'ok', msg: 'eSocial em dia — todos os eventos transmitidos', prioridade: 'ok' },
  { tipo: 'ok', msg: 'Folha de pagamento aprovada e paga em todos os meses', prioridade: 'ok' },
];

function getScoreConfig(score: number) {
  if (score >= 85) return { label: 'Excelente', color: 'text-green-400', ring: '#22c55e', bg: 'bg-green-400/10' };
  if (score >= 70) return { label: 'Bom', color: 'text-blue-400', ring: '#60a5fa', bg: 'bg-blue-400/10' };
  if (score >= 50) return { label: 'Regular', color: 'text-yellow-400', ring: '#facc15', bg: 'bg-yellow-400/10' };
  if (score >= 30) return { label: 'Atenção', color: 'text-orange-400', ring: '#fb923c', bg: 'bg-orange-400/10' };
  return { label: 'Crítico', color: 'text-red-400', ring: '#f87171', bg: 'bg-red-400/10' };
}

const scoreGeral = Math.round(DIMENSOES.reduce((s, d) => s + d.score * d.peso, 0));
const scoreConfig = getScoreConfig(scoreGeral);

// SVG circular progress
function CircularProgress({ score, size = 200 }: { score: number; size?: number }) {
  const cfg = getScoreConfig(score);
  const radius = size * 0.38;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1e2740" strokeWidth={size * 0.08} />
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={cfg.ring} strokeWidth={size * 0.08}
          strokeDasharray={`${progress} ${circumference - progress}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-5xl font-bold ${cfg.color}`}>{score}</span>
        <span className="text-gray-400 text-sm">/ 100</span>
        <span className={`text-base font-semibold mt-1 ${cfg.color}`}>{cfg.label}</span>
      </div>
    </div>
  );
}

export default function SaudeFiscalPage() {
  const { selectedCompany } = useCompany();
  const [expandedDim, setExpandedDim] = useState<string | null>(null);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver o Score de Saúde Fiscal.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Score de Saúde Fiscal</h1>
        <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Avaliação integrada de conformidade</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Score gauge + history */}
        <div className="space-y-4">
          <div className="card-aura flex flex-col items-center py-6">
            <CircularProgress score={scoreGeral} size={200} />
            <div className={`mt-4 px-4 py-2 rounded-full border ${scoreConfig.bg} ${scoreConfig.color} border-current/30`}>
              <span className="text-sm font-semibold">{scoreConfig.label}</span>
            </div>
            <p className="text-gray-500 text-xs mt-2">Calculado em {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          {/* Trend chart */}
          <div className="card-aura">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-400" /> Evolução do Score
            </h3>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={HISTORICO}>
                <XAxis dataKey="mes" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#161b2e', border: '1px solid #1e2740', borderRadius: 6 }} labelStyle={{ color: '#9ca3af' }} />
                <Line type="monotone" dataKey="score" stroke={scoreConfig.ring} strokeWidth={2} dot={{ fill: scoreConfig.ring, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dimensions */}
        <div className="xl:col-span-2 space-y-3">
          <h2 className="text-base font-semibold text-white">Composição do Score por Dimensão</h2>
          {DIMENSOES.map(d => {
            const dcfg = getScoreConfig(d.score);
            const isExpanded = expandedDim === d.nome;
            return (
              <div key={d.nome} className="p-4 bg-[#161b2e] rounded-xl border border-[#1e2740] hover:border-indigo-500/40 transition-colors">
                <button className="w-full" onClick={() => setExpandedDim(isExpanded ? null : d.nome)}>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium">{d.nome}</span>
                          <span className="text-xs text-gray-500">({(d.peso * 100).toFixed(0)}%)</span>
                          {d.alertas.length > 0 && (
                            <span className="text-xs text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">{d.alertas.length} alertas</span>
                          )}
                        </div>
                        <span className={`text-lg font-bold font-mono ${dcfg.color}`}>{d.score}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#0f1117] rounded-full h-2">
                          <div className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${d.score}%`, backgroundColor: dcfg.ring }} />
                        </div>
                        <span className={`text-xs font-medium ${dcfg.color}`}>{dcfg.label}</span>
                      </div>
                    </div>
                  </div>
                </button>
                {isExpanded && d.alertas.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#1e2740] space-y-2">
                    {d.alertas.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-yellow-300">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-yellow-400" />
                        {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Alerts */}
      <div className="card-aura">
        <h3 className="text-base font-semibold text-white mb-4">Alertas e Recomendações</h3>
        <div className="space-y-2">
          {TODOS_ALERTAS.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
              a.tipo === 'erro' ? 'bg-red-400/5 border-red-400/20' :
              a.tipo === 'warning' ? 'bg-yellow-400/5 border-yellow-400/20' :
              a.tipo === 'ok' ? 'bg-green-400/5 border-green-400/20' :
              'bg-blue-400/5 border-blue-400/20'
            }`}>
              {a.tipo === 'erro' ? <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" /> :
               a.tipo === 'warning' ? <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" /> :
               a.tipo === 'ok' ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" /> :
               <Brain className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />}
              <div>
                <p className={`text-sm ${a.tipo === 'erro' ? 'text-red-200' : a.tipo === 'warning' ? 'text-yellow-200' : a.tipo === 'ok' ? 'text-green-200' : 'text-blue-200'}`}>{a.msg}</p>
                <span className={`text-xs mt-0.5 ${a.prioridade === 'alta' ? 'text-red-400' : a.prioridade === 'media' ? 'text-yellow-400' : a.prioridade === 'ok' ? 'text-green-400' : 'text-gray-500'}`}>
                  {a.prioridade === 'ok' ? '✓ Conforme' : `Prioridade: ${a.prioridade}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI recommendations */}
      <div className="card-aura">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" /> Recomendações da IA para elevar o Score
        </h3>
        <div className="space-y-2 text-sm text-gray-300">
          <div className="flex items-start gap-2"><span className="text-indigo-400 font-bold">1.</span><p>Regularize imediatamente o IRRF em atraso para evitar multas e juros. Isso pode elevar o score de <strong className="text-white">Pontualidade</strong> de 72 para ~87.</p></div>
          <div className="flex items-start gap-2"><span className="text-indigo-400 font-bold">2.</span><p>Elabore o planejamento tributário para 2026 usando a ferramenta de <Link href="/tributario" className="text-indigo-400 hover:underline">Comparativo de Regimes</Link>. Pode resultar em economia de até R$ 40k/ano.</p></div>
          <div className="flex items-start gap-2"><span className="text-indigo-400 font-bold">3.</span><p>Com essas correções, o score projetado seria de <strong className="text-green-400">87/100 (Excelente)</strong>.</p></div>
        </div>
      </div>
    </div>
  );
}
