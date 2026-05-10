'use client';
import { useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend
} from 'recharts';
import { Brain, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const SETORES = [
  'Contabilidade e Consultoria',
  'Comércio Varejista',
  'Indústria de Transformação',
  'Tecnologia da Informação',
  'Saúde e Medicina',
  'Construção Civil',
  'Serviços Financeiros',
];

interface MetricaBenchmark {
  dimensao: string;
  empresa: number;
  setor: number;
  unidade: string;
  descricao: string;
}

const MOCK_METRICAS: MetricaBenchmark[] = [
  { dimensao: 'Margem Líquida', empresa: 16.4, setor: 13.2, unidade: '%', descricao: 'Lucro líquido / Receita líquida' },
  { dimensao: 'Margem EBITDA', empresa: 22.8, setor: 19.5, unidade: '%', descricao: 'EBITDA / Receita líquida' },
  { dimensao: 'ROE', empresa: 24.0, setor: 18.7, unidade: '%', descricao: 'Retorno sobre patrimônio líquido' },
  { dimensao: 'Liquidez Corrente', empresa: 1.95, setor: 1.60, unidade: 'x', descricao: 'Ativo circulante / Passivo circulante' },
  { dimensao: 'Endividamento', empresa: 39.4, setor: 44.2, unidade: '%', descricao: 'Dívida total / Ativo total' },
  { dimensao: 'Receita/Funcionário', empresa: 78.5, setor: 62.3, unidade: 'k/ano', descricao: 'Receita anual por funcionário (R$ mil)' },
];

const radarData = MOCK_METRICAS.map(m => ({
  subject: m.dimensao.split(' ').slice(0, 2).join(' '),
  empresa: m.empresa,
  setor: m.setor,
  fullMark: Math.max(m.empresa, m.setor) * 1.3,
}));

export default function BenchmarkPage() {
  const { selectedCompany } = useCompany();
  const [setor, setSetor] = useState(SETORES[0]);

  const acima = MOCK_METRICAS.filter(m => {
    if (m.dimensao === 'Endividamento') return m.empresa < m.setor;
    return m.empresa > m.setor;
  }).length;

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para o benchmark setorial.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Benchmark Setorial</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Comparativo com o setor</p>
        </div>
        <div className="flex items-center gap-3">
          <Target className="h-4 w-4 text-indigo-400" />
          <select value={setor} onChange={e => setSetor(e.target.value)}
            className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500">
            {SETORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Score banner */}
      <div className="flex items-center gap-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
          <span className="text-indigo-400 font-bold text-lg">{acima}/{MOCK_METRICAS.length}</span>
        </div>
        <div>
          <p className="text-white font-semibold">Desempenho acima da média setorial em {acima} de {MOCK_METRICAS.length} indicadores</p>
          <p className="text-gray-400 text-sm">Setor: {setor}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Radar chart */}
        <div className="card-aura">
          <h2 className="text-base font-semibold text-white mb-4">Mapa de Competitividade</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#1e2740" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Radar name="Empresa" dataKey="empresa" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
              <Radar name="Média Setor" dataKey="setor" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics table */}
        <div className="card-aura">
          <h2 className="text-base font-semibold text-white mb-4">Comparativo por Indicador</h2>
          <div className="space-y-3">
            {MOCK_METRICAS.map(m => {
              const isMelhor = m.dimensao === 'Endividamento' ? m.empresa < m.setor : m.empresa > m.setor;
              const diff = m.empresa - m.setor;
              const diffPct = m.setor !== 0 ? ((diff / m.setor) * 100) : 0;
              return (
                <div key={m.dimensao} className="p-3 bg-[#0f1117] rounded-lg border border-[#1e2740]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white text-sm font-medium">{m.dimensao}</p>
                      <p className="text-gray-500 text-xs">{m.descricao}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isMelhor ? 'text-green-400 bg-green-400/10 border-green-400/30' : 'text-red-400 bg-red-400/10 border-red-400/30'}`}>
                      {isMelhor ? 'Acima da média' : 'Abaixo da média'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Empresa</p>
                      <p className={`font-bold font-mono ${isMelhor ? 'text-green-400' : 'text-red-400'}`}>{m.empresa}{m.unidade}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Setor</p>
                      <p className="font-medium font-mono text-gray-300">{m.setor}{m.unidade}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Diferença</p>
                      <p className={`font-medium text-sm flex items-center justify-center gap-1 ${isMelhor ? 'text-green-400' : 'text-red-400'}`}>
                        {isMelhor ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {/* Bar comparison */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12">Emp.</span>
                      <div className="flex-1 bg-[#161b2e] rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (m.empresa / (Math.max(m.empresa, m.setor) * 1.2)) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12">Setor</span>
                      <div className="flex-1 bg-[#161b2e] rounded-full h-1.5">
                        <div className="bg-cyan-500/50 h-1.5 rounded-full" style={{ width: `${Math.min(100, (m.setor / (Math.max(m.empresa, m.setor) * 1.2)) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div className="card-aura">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" /> Análise IA
        </h3>
        <div className="text-sm text-gray-300 space-y-2 leading-relaxed">
          <p>A empresa demonstra <strong className="text-green-400">desempenho superior à média</strong> do setor de {setor} em {acima} dos {MOCK_METRICAS.length} indicadores analisados. Os destaques são a <strong className="text-white">Margem EBITDA</strong> (+16,9% acima da média) e o <strong className="text-white">ROE</strong> (+28,3% acima), indicando eficiência operacional e forte retorno ao acionista.</p>
          <p>Ponto de atenção: apesar do endividamento estar dentro dos parâmetros saudáveis, o crescimento das despesas financeiras (16,7% no último mês) merece monitoramento constante.</p>
        </div>
      </div>
    </div>
  );
}
