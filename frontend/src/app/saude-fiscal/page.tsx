'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Brain, AlertTriangle, CheckCircle, TrendingUp, Loader2, RefreshCw, Info,
  Building2,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Dimensao { nome: string; score: number; peso: number; alertas: string[]; }
interface HealthData {
  scoreGeral: number;
  dimensoes: Dimensao[];
  historico: Array<{ mes: string; score: number }>;
  alertas: Array<{ msg: string; prioridade: string; dimensao: string }>;
  computedAt: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function getScoreConfig(score: number) {
  if (score >= 85) return { label: 'Excelente', color: 'text-green-400', ring: '#22c55e' };
  if (score >= 70) return { label: 'Bom', color: 'text-blue-400', ring: '#60a5fa' };
  if (score >= 50) return { label: 'Regular', color: 'text-yellow-400', ring: '#facc15' };
  if (score >= 30) return { label: 'Atenção', color: 'text-orange-400', ring: '#fb923c' };
  return { label: 'Crítico', color: 'text-red-400', ring: '#f87171' };
}

export default function SaudeFiscalPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/health-score?companyId=${selectedCompany.id}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'erro');
      setData(d);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedCompany?.id]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
          Gerenciar Empresas
        </Link>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="p-6 md:p-8 flex items-center gap-2 text-gray-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Calculando score de saúde fiscal…
      </div>
    );
  }

  const cfg = getScoreConfig(data.scoreGeral);
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (data.scoreGeral / 100) * circumference;

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Saúde Fiscal</h1>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCompany.name} · atualizado em {new Date(data.computedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded inline-flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Recalcular
        </button>
      </div>

      {/* Score gauge */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 flex flex-col md:flex-row gap-6 items-center">
        <svg height={radius * 2} width={radius * 2}>
          <circle stroke="#1e2740" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
          <circle
            stroke={cfg.ring}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset, transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1s' }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          <text x={radius} y={radius - 8} textAnchor="middle" dy="0.3em" fontSize="36" fontWeight="700" fill="#fff">
            {data.scoreGeral}
          </text>
          <text x={radius} y={radius + 22} textAnchor="middle" fontSize="11" fill="#9ca3af">de 100</text>
        </svg>
        <div className="flex-1 space-y-1">
          <p className={`text-3xl font-bold ${cfg.color}`}>{cfg.label}</p>
          <p className="text-sm text-gray-400">
            Score combinado de 6 dimensões usando dados reais da empresa.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Conformidade · Pontualidade · Saúde Financeira · Trabalhista · Qualidade Contábil · Planejamento
          </p>
        </div>
      </div>

      {/* Dimensões */}
      <div className="grid md:grid-cols-2 gap-3">
        {data.dimensoes.map((d) => {
          const c = getScoreConfig(d.score);
          return (
            <div key={d.nome} className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-white">{d.nome}</p>
                <span className={`text-lg font-bold ${c.color}`}>{d.score}</span>
              </div>
              <div className="h-1.5 bg-[#0f1117] rounded overflow-hidden mb-2">
                <div
                  className="h-full transition-all"
                  style={{ width: `${d.score}%`, background: c.ring }}
                />
              </div>
              <p className="text-[10px] text-gray-500">Peso na nota final: {(d.peso * 100).toFixed(0)}%</p>
              {d.alertas.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {d.alertas.map((a, i) => (
                    <li key={i} className="text-xs text-amber-400 flex gap-1.5 items-start">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Histórico */}
      {data.historico.length > 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
          <h2 className="text-sm font-medium text-white mb-3">Histórico de score</h2>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={data.historico}>
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8 }} />
                <Line type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Alertas consolidados */}
      {data.alertas.length > 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
          <h2 className="text-sm font-medium text-white mb-3">Alertas detectados</h2>
          <div className="space-y-2">
            {data.alertas.map((a, i) => (
              <div key={i} className={`p-3 rounded border-l-4 text-xs ${
                a.prioridade === 'alta' ? 'border-red-500 bg-red-500/5 text-red-300'
                : a.prioridade === 'media' ? 'border-amber-500 bg-amber-500/5 text-amber-300'
                : 'border-blue-500 bg-blue-500/5 text-blue-300'
              }`}>
                <p>{a.msg}</p>
                <p className="text-[10px] text-gray-500 mt-1">{a.dimensao}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 flex gap-2 text-xs text-blue-300">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          Score é calculado em tempo real a partir de transações, obrigações fiscais, folha de pagamento
          e fechamentos mensais reais. Histórico usa snapshots dos últimos fechamentos.
        </p>
      </div>
    </div>
  );
}
