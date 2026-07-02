'use client';
import { useEffect, useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Brain, TrendingUp, TrendingDown, Target, Loader2, Building2, Info,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Metrica {
  dimensao: string;
  empresa: number | null;
  setor: number;
  unidade: string;
  descricao: string;
  menorMelhor: boolean;
}

interface BenchmarkResponse {
  companyId: string;
  companyName: string;
  setor: string;
  computedAt: string;
  acimaDaMedia: number;
  totalMetricasComputaveis: number;
  metricas: Metrica[];
  observacao: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function BenchmarkPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [setores, setSetores] = useState<string[]>([]);
  const [setor, setSetor] = useState<string>('Contabilidade e Consultoria');
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/benchmark/setores`)
      .then(r => r.json())
      .then((arr: any[]) => setSetores(arr.map(s => s.name)))
      .catch(() => {});
  }, []);

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/benchmark?companyId=${selectedCompany.id}&setor=${encodeURIComponent(setor)}`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro ao carregar benchmark', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedCompany?.id, setor]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para o benchmark setorial.</p>
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  const metricas = data?.metricas ?? [];
  const computaveis = metricas.filter(m => m.empresa !== null);
  const radarData = computaveis.map(m => ({
    subject: m.dimensao.split(' ').slice(0, 2).join(' '),
    empresa: m.empresa ?? 0,
    setor: m.setor,
  }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Benchmark Setorial</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · Comparativo com o setor (últimos 12 meses)</p>
        </div>
        <div className="flex items-center gap-3">
          <Target className="h-4 w-4 text-indigo-400" />
          <select
            value={setor}
            onChange={e => setSetor(e.target.value)}
            className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
          >
            {setores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando benchmark…
        </div>
      ) : data && (
        <>
          <div className="flex items-center gap-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-400 font-bold text-lg">{data.acimaDaMedia}/{data.totalMetricasComputaveis}</span>
            </div>
            <div>
              <p className="text-white font-semibold">
                Desempenho acima da média setorial em {data.acimaDaMedia} de {data.totalMetricasComputaveis} indicadores
              </p>
              <p className="text-gray-400 text-sm">Setor: {data.setor}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {computaveis.length > 0 && (
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
            )}

            <div className="card-aura">
              <h2 className="text-base font-semibold text-white mb-4">Comparativo por Indicador</h2>
              <div className="space-y-3">
                {metricas.map(m => {
                  const isComputed = m.empresa !== null;
                  const isMelhor = isComputed
                    ? (m.menorMelhor ? (m.empresa! < m.setor) : (m.empresa! > m.setor))
                    : false;
                  const diffPct = isComputed && m.setor !== 0 ? (((m.empresa! - m.setor) / m.setor) * 100) : 0;
                  return (
                    <div key={m.dimensao} className={`p-3 bg-[#0f1117] rounded-lg border ${isComputed ? 'border-[#1e2740]' : 'border-[#1e2740]/50 opacity-60'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-white text-sm font-medium">{m.dimensao}</p>
                          <p className="text-gray-500 text-xs">{m.descricao}</p>
                        </div>
                        {isComputed ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isMelhor ? 'text-green-400 bg-green-400/10 border-green-400/30' : 'text-red-400 bg-red-400/10 border-red-400/30'}`}>
                            {isMelhor ? 'Acima da média' : 'Abaixo da média'}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-gray-500/30 bg-gray-500/10 text-gray-400">N/D</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-0.5">Empresa</p>
                          <p className={`font-bold font-mono ${isComputed ? (isMelhor ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                            {isComputed ? `${m.empresa}${m.unidade}` : '—'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-0.5">Setor</p>
                          <p className="font-medium font-mono text-gray-300">{m.setor}{m.unidade}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-0.5">Diferença</p>
                          <p className={`font-medium text-sm flex items-center justify-center gap-1 ${isComputed ? (isMelhor ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                            {isComputed ? (
                              <>
                                {isMelhor ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                              </>
                            ) : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex gap-2">
            <Info className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-300 leading-relaxed">
              {data.observacao}
            </p>
          </div>

          <p className="text-[10px] text-gray-600 text-center">
            Dados setoriais: SEBRAE 2024 + SEFAZ Empresariômetro · Computado em {new Date(data.computedAt).toLocaleString('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
}
