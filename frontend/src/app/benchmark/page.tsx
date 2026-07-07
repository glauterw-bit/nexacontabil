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
import { PageHeader, COLORS, tint, EmptyState, Spinner, StatusChip } from '@/components/ui/kit';

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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para o benchmark setorial." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
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
    <div className="page space-y-6">
      <PageHeader
        icon={<Target size={22} color={COLORS.acao} />}
        title="Benchmark Setorial"
        subtitle={`${selectedCompany.name} · Comparativo com o setor (últimos 12 meses)`}
        action={
          <select
            value={setor}
            onChange={e => setSetor(e.target.value)}
            className="input-aura"
          >
            {setores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        }
      />

      {loading && !data ? (
        <Spinner />
      ) : data && (
        <>
          <div className="card-aura flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-inset flex items-center justify-center flex-shrink-0">
              <span className="text-tx-strong font-bold text-lg num">{data.acimaDaMedia}/{data.totalMetricasComputaveis}</span>
            </div>
            <div>
              <p className="text-tx-strong font-semibold">
                Desempenho acima da média setorial em {data.acimaDaMedia} de {data.totalMetricasComputaveis} indicadores
              </p>
              <p className="text-tx-muted text-sm">Setor: {data.setor}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {computaveis.length > 0 && (
              <div className="card-aura">
                <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-4">Mapa de Competitividade</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                    <Radar name="Empresa" dataKey="empresa" stroke="var(--acao)" fill="var(--acao)" fillOpacity={0.3} />
                    <Radar name="Média Setor" dataKey="setor" stroke="var(--info)" fill="var(--info)" fillOpacity={0.15} />
                    <Legend wrapperStyle={{ color: 'var(--muted)', fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="card-aura">
              <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-4">Comparativo por Indicador</h3>
              <div className="space-y-3">
                {metricas.map(m => {
                  const isComputed = m.empresa !== null;
                  const isMelhor = isComputed
                    ? (m.menorMelhor ? (m.empresa! < m.setor) : (m.empresa! > m.setor))
                    : false;
                  const diffPct = isComputed && m.setor !== 0 ? (((m.empresa! - m.setor) / m.setor) * 100) : 0;
                  return (
                    <div key={m.dimensao} className={`p-3 bg-inset rounded-lg border border-line-soft ${isComputed ? '' : 'opacity-60'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-tx-strong text-sm font-medium">{m.dimensao}</p>
                          <p className="text-tx-muted text-xs">{m.descricao}</p>
                        </div>
                        {isComputed ? (
                          <StatusChip tone={isMelhor ? 'ok' : 'critico'} label={isMelhor ? 'Acima da média' : 'Abaixo da média'} size="sm" />
                        ) : (
                          <StatusChip tone="pendente" label="N/D" size="sm" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-tx-muted mb-0.5">Empresa</p>
                          <p className={`font-bold num ${isComputed ? (isMelhor ? 'text-ok' : 'text-err') : 'text-tx-faint'}`}>
                            {isComputed ? `${m.empresa}${m.unidade}` : '—'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-tx-muted mb-0.5">Setor</p>
                          <p className="font-medium num text-tx">{m.setor}{m.unidade}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-tx-muted mb-0.5">Diferença</p>
                          <p className={`font-medium text-sm flex items-center justify-center gap-1 num ${isComputed ? (isMelhor ? 'text-ok' : 'text-err') : 'text-tx-faint'}`}>
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

          <div className="rounded-xl p-4 flex gap-2"
            style={{ background: tint(COLORS.info, 8), border: `1px solid ${tint(COLORS.info, 25)}` }}>
            <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
            <p className="text-xs text-tx leading-relaxed">
              {data.observacao}
            </p>
          </div>

          <p className="text-[10px] text-tx-faint text-center">
            Dados setoriais: SEBRAE 2024 + SEFAZ Empresariômetro · Computado em {new Date(data.computedAt).toLocaleString('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
}
