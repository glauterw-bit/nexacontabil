'use client';
import { useEffect, useState } from 'react';
import {
  Activity, Loader2, CheckCircle2, AlertTriangle, Clock, Users as UsersIcon,
  TrendingUp, Award,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function comp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardGerencialPage() {
  const toast = useToast();
  const [competencia, setCompetencia] = useState(comp());
  const [kpis, setKpis] = useState<any>(null);
  const [producao, setProducao] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [k, p] = await Promise.all([
        fetch(`${API}/api/v1/workflow/kpis?competencia=${competencia}`, { headers }).then((r) => r.json()),
        fetch(`${API}/api/v1/workflow/producao-por-analista?competencia=${competencia}`, { headers }).then((r) => r.json()),
      ]);
      setKpis(k);
      setProducao(Array.isArray(p) ? p : []);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [competencia]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Activity className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Dashboard Gerencial</h1>
          </div>
          <p className="text-sm text-gray-400">Produção do escritório · SLA · gargalos</p>
        </div>
        <input
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none"
        />
      </div>

      {loading && (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando KPIs…
        </div>
      )}

      {!loading && kpis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI label="Total tasks" value={kpis.total} />
            <KPI label="Concluídas" value={kpis.concluidas} icon={CheckCircle2} color="text-emerald-400" />
            <KPI label="Em andamento" value={kpis.emAndamento} icon={Clock} color="text-indigo-400" />
            <KPI label="Vencidas" value={kpis.vencidas} icon={AlertTriangle} color="text-red-400" />
            <KPI label="% SLA" value={`${kpis.pctSla}%`} icon={Award} color={kpis.pctSla >= 85 ? 'text-emerald-400' : kpis.pctSla >= 60 ? 'text-amber-400' : 'text-red-400'} highlight />
          </div>

          {kpis.gargalo && kpis.gargalo.abertas > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-medium text-amber-300">Gargalo identificado</p>
              </div>
              <p className="text-xs text-amber-200">
                <strong>{kpis.gargalo.label}</strong> tem {kpis.gargalo.abertas} tasks abertas — etapa mais lenta do escritório.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
              <h2 className="text-sm font-medium text-white mb-3">Tasks abertas por estágio</h2>
              <div className="space-y-2">
                {kpis.porEstagio.map((s: any) => (
                  <div key={s.stage}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-300">{s.label}</span>
                      <span className="text-gray-500 font-mono">{s.abertas}</span>
                    </div>
                    <div className="h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-amber-400"
                        style={{ width: `${Math.min(100, (s.abertas / Math.max(1, kpis.total)) * 100 * 7)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
              <h2 className="text-sm font-medium text-white mb-3">Tempo médio por estágio</h2>
              <div className="space-y-1.5">
                {kpis.temposPorEstagio.map((t: any) => (
                  <div key={t.stage} className="flex justify-between items-center text-xs">
                    <span className="text-gray-300">{t.label}</span>
                    <span className="font-mono text-gray-200">
                      {t.horas > 0 ? `${t.horas}h` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-3">Calculado a partir de tasks concluídas com Iniciar→Concluir registrados.</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
            <h2 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-indigo-400" />
              Produção por analista ({producao.length})
            </h2>
            {producao.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">Nenhuma task atribuída a analista neste mês.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                    <th className="pb-2">Analista</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2 text-right">Concluídas</th>
                    <th className="pb-2 text-right">Em andamento</th>
                    <th className="pb-2 text-right">Vencidas</th>
                    <th className="pb-2 text-right">% SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2740]">
                  {producao.map((p) => (
                    <tr key={p.analystId} className="hover:bg-white/5">
                      <td className="py-2 text-xs text-white">
                        {p.analyst?.name ?? <span className="font-mono text-gray-500">{p.analystId.slice(0, 8)}</span>}
                        {p.analyst?.role && <span className="ml-2 text-[10px] text-gray-500">({p.analyst.role})</span>}
                      </td>
                      <td className="py-2 text-xs text-right font-mono text-gray-300">{p.total}</td>
                      <td className="py-2 text-xs text-right font-mono text-emerald-400">{p.concluidas}</td>
                      <td className="py-2 text-xs text-right font-mono text-indigo-400">{p.emAndamento}</td>
                      <td className="py-2 text-xs text-right font-mono text-red-400">{p.vencidas}</td>
                      <td className="py-2 text-xs text-right font-mono">
                        <span className={p.pctSla >= 85 ? 'text-emerald-400' : p.pctSla >= 60 ? 'text-amber-400' : 'text-red-400'}>
                          {p.pctSla}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color, highlight }: any) {
  return (
    <div className={`rounded-xl border ${highlight ? 'border-indigo-500/40' : 'border-[#1e2740]'} bg-[#161b2e] p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`h-3 w-3 ${color || 'text-gray-400'}`} />}
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}
