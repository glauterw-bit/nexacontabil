'use client';
import { useEffect, useState, useCallback } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Building2, Loader2, RefreshCw, CheckCircle2, Clock, AlertTriangle, Circle,
  FileText, Brain, ShieldAlert, HeartPulse, Users, CalendarClock,
} from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

const ST: Record<string, { c: string; label: string }> = {
  concluida:    { c: '#10b981', label: 'Concluída' },
  em_andamento: { c: '#6366f1', label: 'Em andamento' },
  bloqueada:    { c: '#ef4444', label: 'Bloqueada' },
  pendente:     { c: '#64748b', label: 'Pendente' },
  sem_tarefa:   { c: '#3a4256', label: '—' },
};
const nivelCor = (level: string) => ({ baixo: '#10b981', medio: '#f59e0b', alto: '#f97316', critico: '#ef4444' } as any)[level] ?? '#64748b';

export default function DashboardPage() {
  const { selectedCompany } = useCompany();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/dashboard-empresa?companyId=${selectedCompany.id}`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, [selectedCompany]);

  async function analisarSharepoint() {
    if (!selectedCompany) return;
    setAnalisando(true); setMsg(null);
    try {
      const r = await fetch(`${API}/api/v1/analise-cliente`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Falha');
      setMsg(`${d.analisados} documentos analisados · ${d.inconsistencias} inconsistências · ${d.jaExistiam} já existiam`);
      load();
    } catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setAnalisando(false); }
  }

  useEffect(() => { setData(null); load(); }, [load]);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione um cliente na barra lateral para ver o painel.</p>
        <Link href="/carteira" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Ver carteira</Link>
      </div>
    );
  }

  const cr = data?.cronograma;
  const ia = data?.analiseIA;

  return (
    <div className="p-5 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{selectedCompany.name}</h1>
          <p className="text-sm text-gray-400">{selectedCompany.taxRegime?.replace(/_/g, ' ')} · competência {data?.competencia ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={analisarSharepoint} disabled={analisando}
            className="px-3 py-2 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-1.5">
            {analisando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            Analisar XMLs do SharePoint
          </button>
          <button onClick={load} disabled={loading} className="p-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-gray-400 hover:text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {msg && <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-200">{msg}</div>}

      {loading && !data ? (
        <div className="text-center py-24 text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Carregando o painel…</div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Cronograma do mês" value={`${cr?.pct ?? 0}%`} sub={`${cr?.concluidas ?? 0}/${cr?.total ?? 0} etapas`} icon={CalendarClock} color={cr?.pct >= 80 ? '#10b981' : cr?.pct >= 40 ? '#f59e0b' : '#ef4444'} />
            <Kpi label="Pendências" value={data.totalPendencias} sub={data.totalPendencias ? 'precisam ação' : 'tudo em dia'} icon={AlertTriangle} color={data.totalPendencias ? '#ef4444' : '#10b981'} />
            <Kpi label="Documentos analisados" value={`${data.documentos.analisados}/${data.documentos.total}`} sub={BRL(data.documentos.valorTotal)} icon={FileText} color="#6366f1" />
            <Kpi label="Risco de malha fina" value={ia?.malhaFina ? `${ia.malhaFina.score}` : '—'} sub={ia?.malhaFina ? `nível ${ia.malhaFina.level}` : 'sem dados'} icon={ShieldAlert} color={ia?.malhaFina ? nivelCor(ia.malhaFina.level) : '#64748b'} />
          </div>

          <Card title="Cronograma fiscal e contábil" icon={CalendarClock} action={<Link href="/kanban" className="text-xs text-indigo-400 hover:underline">Kanban →</Link>}>
            <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
              {(cr?.etapas ?? []).map((e: any, i: number) => {
                const s = ST[e.status] ?? ST.pendente;
                return (
                  <div key={e.stage} className="flex-1 min-w-[120px]">
                    <div className="rounded-lg border p-2.5" style={{ borderColor: e.vencida ? '#ef4444' : '#1e2740', background: e.vencida ? '#ef444410' : '#0f1117' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Etapa {i + 1}</span>
                        {e.status === 'concluida' ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: s.c }} />
                          : e.status === 'em_andamento' ? <Clock className="h-3.5 w-3.5" style={{ color: s.c }} />
                          : e.vencida ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                          : <Circle className="h-3.5 w-3.5 text-gray-600" />}
                      </div>
                      <p className="text-xs text-white leading-tight font-medium">{e.label}</p>
                      <p className="text-[10px] mt-1" style={{ color: e.vencida ? '#f87171' : s.c }}>
                        {e.status === 'concluida' ? 'OK' : e.vencida ? `venceu ${dataBR(e.slaDate)}` : `prazo ${dataBR(e.slaDate)}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title={`Pendências (${data.totalPendencias})`} icon={AlertTriangle}>
              {data.pendencias.length === 0 ? <Empty msg="Nenhuma pendência. Cliente em dia. 🎉" /> : (
                <div className="space-y-2">
                  {data.pendencias.map((p: any, i: number) => {
                    const cor = p.diasAtraso > 15 ? '#ef4444' : p.diasAtraso > 5 ? '#f59e0b' : '#64748b';
                    return (
                      <div key={i} className="flex items-center gap-2.5 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />
                        <span className="flex-1 text-gray-200 truncate">{p.titulo}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: cor + '22', color: cor }}>{p.tipo} · {p.diasAtraso}d</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Próximas obrigações" icon={CalendarClock} action={<Link href="/obrigacoes" className="text-xs text-indigo-400 hover:underline">Ver todas →</Link>}>
              {(!data.obrigacoes.proximas || data.obrigacoes.proximas.length === 0) ? (
                <Empty msg={data.obrigacoes.vencidas > 0 ? `${data.obrigacoes.vencidas} obrigação(ões) vencida(s)` : 'Sem obrigações cadastradas neste cliente.'} />
              ) : (
                <div className="space-y-2">
                  {data.obrigacoes.proximas.map((o: any, i: number) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <CalendarClock className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                      <span className="flex-1 text-gray-200 truncate">{o.nome}</span>
                      <span className="text-[11px] text-amber-300">{dataBR(o.venc)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Resumo fiscal profundo (das notas analisadas) ── */}
          {data.documentos.resumoFiscal && data.documentos.analisados > 0 && (
            <Card title="Análise fiscal — apurado das notas" icon={FileText}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Mini label="Faturamento" value={BRL(data.documentos.resumoFiscal.faturamento)} color="#10b981" />
                <Mini label="Total impostos" value={BRL(data.documentos.resumoFiscal.impostos.total)} color="#f59e0b" />
                <Mini label="Carga tributária" value={`${data.documentos.resumoFiscal.cargaTributaria}%`} color="#6366f1" />
                <Mini label="Inconsistências" value={data.documentos.resumoFiscal.totalInconsistencias} color={data.documentos.resumoFiscal.totalInconsistencias ? '#ef4444' : '#10b981'} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5">Impostos apurados</p>
                  <div className="space-y-1">
                    {[['ICMS', data.documentos.resumoFiscal.impostos.icms], ['ICMS-ST', data.documentos.resumoFiscal.impostos.icmsSt], ['IPI', data.documentos.resumoFiscal.impostos.ipi], ['PIS', data.documentos.resumoFiscal.impostos.pis], ['COFINS', data.documentos.resumoFiscal.impostos.cofins]].map(([k, v]: any) => (
                      <div key={k} className="flex items-center justify-between text-xs"><span className="text-gray-400">{k}</span><span className="font-mono text-gray-200">{BRL(v)}</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5">Top NCMs (por valor)</p>
                  <div className="space-y-1">
                    {data.documentos.resumoFiscal.topNcm.slice(0, 5).map((n: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-indigo-300">{n.ncm}</span>
                        <span className="text-gray-400 truncate flex-1">{n.descricao}</span>
                        <span className="font-mono text-gray-300">{BRL(n.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {data.documentos.resumoFiscal.inconsistencias.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-medium text-amber-300 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Inconsistências fiscais detectadas</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {data.documentos.resumoFiscal.inconsistencias.map((inc: any, i: number) => (
                      <div key={i} className="text-[11px]"><span className="text-gray-400">{inc.doc}:</span> <span className="text-amber-200/80">{inc.problemas.join(' · ')}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card title="Análises da IA — fiscal e contábil" icon={Brain} action={<Link href="/risco-fiscal" className="text-xs text-indigo-400 hover:underline">Risco fiscal →</Link>}>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-4">
                <div className="flex items-center gap-2 mb-2"><ShieldAlert className="h-4 w-4 text-indigo-400" /><span className="text-xs text-gray-400">Risco de malha fina</span></div>
                {ia?.malhaFina ? (
                  <>
                    <p className="text-3xl font-bold" style={{ color: nivelCor(ia.malhaFina.level) }}>{ia.malhaFina.score}<span className="text-sm text-gray-600">/100</span></p>
                    <p className="text-xs mt-0.5 capitalize" style={{ color: nivelCor(ia.malhaFina.level) }}>{ia.malhaFina.level}</p>
                    {ia.malhaFina.fatores?.length > 0 && <p className="text-[11px] text-gray-500 mt-2 leading-snug">{ia.malhaFina.fatores[0].fator}</p>}
                  </>
                ) : <p className="text-xs text-gray-600">Sem dados suficientes.</p>}
              </div>
              <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-4">
                <div className="flex items-center gap-2 mb-2"><HeartPulse className="h-4 w-4 text-emerald-400" /><span className="text-xs text-gray-400">Saúde fiscal-contábil</span></div>
                {ia?.saudeFiscal ? (
                  <>
                    <p className="text-3xl font-bold text-white">{ia.saudeFiscal.score}<span className="text-sm text-gray-600">/100</span></p>
                    <div className="space-y-1 mt-2">
                      {(ia.saudeFiscal.dimensoes ?? []).slice(0, 3).map((d: any, i: number) => (
                        <div key={i}>
                          <div className="flex justify-between text-[10px] text-gray-500"><span className="truncate">{d.nome}</span><span>{d.score}</span></div>
                          <div className="h-1 bg-[#1e2740] rounded-full"><div className="h-full rounded-full" style={{ width: `${d.score}%`, background: d.score >= 75 ? '#10b981' : d.score >= 50 ? '#f59e0b' : '#ef4444' }} /></div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-xs text-gray-600">Sem dados suficientes.</p>}
              </div>
              <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-4">
                <div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-amber-400" /><span className="text-xs text-gray-400">Anomalias na folha</span></div>
                <p className="text-3xl font-bold" style={{ color: ia?.folhaAnomalias ? '#f59e0b' : '#10b981' }}>{ia?.folhaAnomalias ?? 0}</p>
                <p className="text-[11px] text-gray-500 mt-2">{ia?.folhaAnomalias ? 'detectadas — revisar holerites' : 'nenhuma anomalia detectada'}</p>
              </div>
            </div>
          </Card>

          {data.documentos.recentes?.length > 0 && (
            <Card title="Documentos analisados recentemente" icon={FileText} action={<Link href="/captura-xml" className="text-xs text-indigo-400 hover:underline">Analisar mais →</Link>}>
              <div className="space-y-1.5">
                {data.documentos.recentes.map((d: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 text-gray-200 truncate">{d.nome}</span>
                    {d.emitente && <span className="text-[11px] text-gray-500 truncate max-w-[140px]">{d.emitente}</span>}
                    {d.valor != null && <span className="text-[11px] font-mono text-emerald-400">{BRL(d.valor)}</span>}
                    <span className={`text-[10px] ${d.status === 'completed' ? 'text-emerald-400' : 'text-gray-500'}`}>{d.status === 'completed' ? '✓' : d.status}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <p className="text-[11px] text-gray-600 text-center">Atualizado em {data.atualizadoEm ? new Date(data.atualizadoEm).toLocaleString('pt-BR') : '—'}</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, color }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <div className="flex items-center justify-between mb-1"><span className="text-[11px] text-gray-500">{label}</span><Icon className="h-3.5 w-3.5" style={{ color }} /></div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
function Card({ title, icon: Icon, action, children }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-white flex items-center gap-2"><Icon className="h-4 w-4 text-gray-400" /> {title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
function Mini({ label, value, color = '#fff' }: { label: string; value: any; color?: string }) {
  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-3 text-center">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className="text-base font-bold truncate" style={{ color }}>{value}</p>
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <p className="text-xs text-gray-600 text-center py-6">{msg}</p>;
}
