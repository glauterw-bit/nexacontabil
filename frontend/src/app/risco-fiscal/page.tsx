'use client';
import { useEffect, useState } from 'react';
import {
  Shield, AlertTriangle, Loader2, Brain, RefreshCw, Users, Building2, TrendingDown,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface MalhaFinaRisk {
  score: number;
  level: 'baixo' | 'medio' | 'alto' | 'critico';
  fatores: Array<{ fator: string; impacto: number; explicacao: string }>;
  recomendacoes: string[];
  resumoIA?: string;
  computedAt: string;
}

interface FolhaAnomaly {
  employeeId: string;
  employeeName: string;
  tipo: string;
  severidade: 'baixa' | 'media' | 'alta';
  detalhe: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const LEVEL_CONFIG = {
  baixo: { color: 'text-emerald-400', ring: '#10b981', label: 'Baixo' },
  medio: { color: 'text-amber-400', ring: '#f59e0b', label: 'Médio' },
  alto: { color: 'text-orange-400', ring: '#f97316', label: 'Alto' },
  critico: { color: 'text-red-400', ring: '#ef4444', label: 'Crítico' },
};

export default function RiscoFiscalPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [risk, setRisk] = useState<MalhaFinaRisk | null>(null);
  const [anomalies, setAnomalies] = useState<FolhaAnomaly[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const [rR, aR] = await Promise.all([
        fetch(`${API}/api/v1/predictive/malha-fina?companyId=${selectedCompany.id}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/predictive/folha-anomalies?companyId=${selectedCompany.id}`, { headers: authHeaders() }),
      ]);
      setRisk(await rR.json());
      const a = await aR.json();
      setAnomalies(Array.isArray(a) ? a : []);
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
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Gerenciar</Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Shield className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Risco Fiscal Preditivo</h1>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">IA</span>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCompany.name} · análise preditiva de malha fina + anomalias de folha
          </p>
        </div>
        <button onClick={load} disabled={loading} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded inline-flex items-center gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Recalcular
        </button>
      </div>

      {loading && !risk ? (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Analisando indicadores fiscais e folha…
        </div>
      ) : risk && (
        <>
          <RiskGauge risk={risk} />

          {risk.resumoIA && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex gap-2">
              <Brain className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-200 leading-relaxed">{risk.resumoIA}</p>
            </div>
          )}

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h2 className="text-sm font-medium text-white mb-3">Fatores de risco detectados</h2>
            {risk.fatores.length === 0 ? (
              <p className="text-xs text-emerald-400 text-center py-6">Nenhum fator de risco identificado.</p>
            ) : (
              <div className="space-y-2">
                {risk.fatores.map((f, i) => (
                  <div key={i} className="p-3 rounded border border-[#1e2740] bg-[#0f1117]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{f.fator}</p>
                      <span className="px-2 py-0.5 text-[10px] bg-red-500/15 text-red-300 border border-red-500/30 rounded">
                        +{f.impacto} pts
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{f.explicacao}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {risk.recomendacoes.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h2 className="text-sm font-medium text-white mb-2">Recomendações</h2>
              <ul className="space-y-1">
                {risk.recomendacoes.map((r, i) => (
                  <li key={i} className="text-xs text-gray-200 flex gap-2 items-start">
                    <span className="text-emerald-400">→</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {anomalies.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-medium text-white">Anomalias na folha de pagamento ({anomalies.length})</h2>
              </div>
              <div className="space-y-2">
                {anomalies.map((a, i) => (
                  <div key={i} className={`p-3 rounded border ${
                    a.severidade === 'alta' ? 'border-red-500/30 bg-red-500/5'
                    : a.severidade === 'media' ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-blue-500/30 bg-blue-500/5'
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{a.employeeName}</p>
                      <span className="text-[10px] uppercase">{a.severidade}</span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1">{a.detalhe}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{a.tipo.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-600 text-center">
            Análise baseada em dados reais dos últimos 12 meses · Computado em {new Date(risk.computedAt).toLocaleString('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
}

function RiskGauge({ risk }: { risk: MalhaFinaRisk }) {
  const cfg = LEVEL_CONFIG[risk.level];
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (risk.score / 100) * circumference;
  return (
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
          {risk.score}
        </text>
        <text x={radius} y={radius + 22} textAnchor="middle" fontSize="11" fill="#9ca3af">de 100</text>
      </svg>
      <div className="flex-1">
        <p className={`text-3xl font-bold ${cfg.color}`}>{cfg.label}</p>
        <p className="text-sm text-gray-400 mt-1">
          Risco preditivo de cair em malha fina ou ser autuado pela Receita Federal/SEFAZ.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Calculado por 7 fatores ponderados: documentos com inconsistência, obrigações vencidas,
          lançamentos desbalanceados, certidões positivas, falta de fechamento, despesa/receita
          desproporcional e folha vs receita.
        </p>
      </div>
    </div>
  );
}
