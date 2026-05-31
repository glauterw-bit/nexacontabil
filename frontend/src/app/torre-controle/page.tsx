'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Gauge, RefreshCw, Loader2, CheckCircle2, Mail, MessageCircle, Bell,
  AlertTriangle, TrendingUp, Users, Layers, Activity, Send, ShieldAlert,
  Clock, Zap, ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from 'recharts';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
function mesAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const sev = (s: string) => s === 'alta' ? '#ef4444' : s === 'media' ? '#f59e0b' : '#64748b';
function cor(pct: number, invert = false) {
  const good = invert ? pct <= 5 : pct >= 85;
  const mid = invert ? pct <= 15 : pct >= 60;
  return good ? '#10b981' : mid ? '#f59e0b' : '#ef4444';
}

export default function TorreControlePage() {
  const [comp, setComp] = useState(mesAtual());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/v1/torre-controle/overview?competencia=${comp}`, { headers: authHeaders() });
      if (r.ok) setData(await r.json());
    } catch { /* noop */ } finally { setLoading(false); }
  }, [comp]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    if (auto) { timer.current = setInterval(load, 30000); return () => clearInterval(timer.current); }
  }, [auto, load]);

  const p = data?.pulso;

  return (
    <div className="p-5 md:p-7 max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Gauge className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Torre de Controle</h1>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">Gestor</span>
          </div>
          <p className="text-sm text-gray-400">Visão operacional consolidada do escritório · todos os clientes e analistas</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={comp} onChange={(e) => setComp(e.target.value)}
            className="bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
          <button onClick={() => setAuto((a) => !a)}
            className={`px-3 py-2 text-xs rounded-lg border inline-flex items-center gap-1.5 ${auto ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-[#161b2e] border-[#1e2740] text-gray-400'}`}>
            <Zap className="h-3.5 w-3.5" /> {auto ? 'Ao vivo' : 'Auto'}
          </button>
          <button onClick={load} className="p-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-gray-400 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-24 text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Consolidando a operação…</div>
      ) : data && (
        <>
          {/* PULSO */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <RingTile label="Produção da equipe" pct={p.pctProducao} sub={`${p.concluidas}/${p.total} tarefas`} icon={TrendingUp} />
            <RingTile label="No prazo (SLA)" pct={p.pctSla} sub={`${p.vencidas} vencidas`} icon={Clock} />
            <Tile label="Vencidas" value={p.vencidas} icon={AlertTriangle} color={p.vencidas > 0 ? '#ef4444' : '#10b981'} sub={`${p.bloqueadas} bloqueadas`} />
            <Tile label="Docs enviados" value={p.docsEnviados} icon={Send} color="#6366f1" sub="no mês" />
            <Tile label="Pendências" value={p.pendencias} icon={ShieldAlert} color={p.pendencias > 0 ? '#f59e0b' : '#10b981'} sub="obrig. + honor." />
            <Tile label="Inadimplência" value={`${p.inadimplencia.taxa}%`} icon={Activity} color={cor(p.inadimplencia.taxa, true)} sub={BRL(p.inadimplencia.valorVencido)} />
          </div>

          {/* MAIN */}
          <div className="grid lg:grid-cols-5 gap-5">
            {/* Esquerda: produção por analista */}
            <div className="lg:col-span-3 space-y-5">
              <Card title="Produção por analista" icon={Users} action={<Link href="/gestao-equipe" className="text-xs text-indigo-400 hover:underline">Gerenciar equipe →</Link>}>
                {data.analistas.length === 0 ? (
                  <Empty msg="Sem tarefas atribuídas nesta competência." />
                ) : (
                  <div className="space-y-2.5">
                    {data.analistas.map((a: any) => (
                      <div key={a.analystId} className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {a.nome?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-white truncate">{a.nome}</span>
                            <span className="text-xs text-gray-500 flex-shrink-0">{a.concluidas}/{a.total}</span>
                          </div>
                          <div className="h-1.5 bg-[#0f1117] rounded-full mt-1 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${a.pctConclusao}%`, background: cor(a.pctConclusao) }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 w-[150px] justify-end">
                          <Pill label={`${a.carteira} cli`} tone="slate" />
                          {a.vencidas > 0 && <Pill label={`${a.vencidas} venc`} tone="red" />}
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ color: cor(a.pctSla), background: cor(a.pctSla) + '20' }}>SLA {a.pctSla}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Desempenho comparativo" icon={TrendingUp}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.analistas.map((a: any) => ({ nome: a.nome?.split(' ')[0] ?? '?', Concluídas: a.concluidas, 'Em and.': a.emAndamento, Vencidas: a.vencidas }))} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2740" vertical={false} />
                    <XAxis dataKey="nome" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="Concluídas" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Em and." fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Vencidas" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Direita: funil + fluxo */}
            <div className="lg:col-span-2 space-y-5">
              <Card title="Funil de estágios" icon={Layers} action={<Link href="/kanban" className="text-xs text-indigo-400 hover:underline">Kanban →</Link>}>
                {data.gargalo && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Gargalo em <b className="font-semibold">{data.gargalo.label}</b> · {data.gargalo.abertas} abertas
                  </div>
                )}
                <div className="space-y-2">
                  {data.estagios.map((s: any) => {
                    const max = Math.max(...data.estagios.map((x: any) => x.total), 1);
                    return (
                      <div key={s.stage}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-gray-300">{s.label}</span>
                          <span className="text-gray-500">{s.abertas} abertas{s.vencidas > 0 && <span className="text-red-400"> · {s.vencidas} venc</span>}</span>
                        </div>
                        <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(s.total / max) * 100}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card title="Fluxo operacional ao vivo" icon={Activity}>
                {data.fluxo.length === 0 ? <Empty msg="Sem movimentações recentes." /> : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {data.fluxo.map((e: any, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm">
                        <FluxoIcon icone={e.icone} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-200 leading-tight">{e.texto}</p>
                          <p className="text-[11px] text-gray-600">{e.ator ? `${e.ator} · ` : ''}{tempoRel(e.quando)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* BOTTOM */}
          <div className="grid lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <Card title={`Pendências dos clientes (${data.pendencias.length})`} icon={ShieldAlert}>
                {data.pendencias.length === 0 ? <Empty msg="Nenhuma pendência aberta. 🎉" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead><tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                        <th className="pb-2 font-medium">Cliente</th><th className="pb-2 font-medium">Pendência</th>
                        <th className="pb-2 font-medium text-center">Dias</th><th className="pb-2 font-medium">Responsável</th>
                      </tr></thead>
                      <tbody className="divide-y divide-[#1e2740]">
                        {data.pendencias.map((pd: any, i: number) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="py-2 text-white">{pd.cliente}</td>
                            <td className="py-2 text-gray-400 max-w-[260px] truncate" title={pd.pendencia}>
                              <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: sev(pd.severidade) }} />{pd.pendencia}
                            </td>
                            <td className="py-2 text-center font-mono" style={{ color: sev(pd.severidade) }}>{pd.diasParado}</td>
                            <td className="py-2 text-gray-400">{pd.responsavel ?? <span className="text-amber-400/70">sem resp.</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card title="Carga por analista" icon={Users} action={data.carga.semResponsavel > 0 ? <span className="text-xs text-amber-400">{data.carga.semResponsavel} sem resp.</span> : undefined}>
                {data.carga.porAnalista.length === 0 ? <Empty msg="Sem carteiras atribuídas." /> : (
                  <ResponsiveContainer width="100%" height={Math.max(160, data.carga.porAnalista.length * 38)}>
                    <BarChart data={data.carga.porAnalista} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" stroke="#64748b" fontSize={11} allowDecimals={false} tickLine={false} />
                      <YAxis type="category" dataKey="nome" stroke="#64748b" fontSize={11} width={90} tickLine={false} tickFormatter={(v: string) => v.split(' ')[0]} />
                      <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1e2740', borderRadius: 8, fontSize: 12 }} cursor={{ fill: '#1e274055' }} />
                      <Bar dataKey="clientes" radius={[0, 4, 4, 0]}>
                        {data.carga.porAnalista.map((_: any, i: number) => <Cell key={i} fill={['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'][i % 6]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>
          </div>

          <p className="text-[11px] text-gray-600 text-center">Atualizado em {new Date(data.atualizadoEm).toLocaleString('pt-BR')} · competência {data.competencia}</p>
        </>
      )}
    </div>
  );
}

// ── componentes ──────────────────────────────────────────────
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

function Tile({ label, value, icon: Icon, color, sub }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-gray-500">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function RingTile({ label, pct, sub, icon: Icon }: any) {
  const r = 18, c = 2 * Math.PI * r, off = c - (pct / 100) * c, color = cor(pct);
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-gray-500">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div className="flex items-center gap-3">
        <svg width="46" height="46" className="flex-shrink-0">
          <circle cx="23" cy="23" r={r} fill="none" stroke="#0f1117" strokeWidth="5" />
          <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 23 23)" style={{ transition: 'stroke-dashoffset .6s' }} />
          <text x="23" y="23" textAnchor="middle" dy="0.35em" fontSize="12" fontWeight="700" fill="#fff">{pct}%</text>
        </svg>
        <div className="min-w-0"><p className="text-[11px] text-gray-600 truncate">{sub}</p></div>
      </div>
    </div>
  );
}

function Pill({ label, tone }: { label: string; tone: 'slate' | 'red' }) {
  const tones: any = { slate: 'bg-slate-500/15 text-slate-300', red: 'bg-red-500/15 text-red-300' };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${tones[tone]}`}>{label}</span>;
}

function FluxoIcon({ icone }: { icone: string }) {
  const map: any = {
    check: { I: CheckCircle2, c: 'text-emerald-400' }, mail: { I: Mail, c: 'text-indigo-400' },
    message: { I: MessageCircle, c: 'text-green-400' }, bell: { I: Bell, c: 'text-amber-400' },
  };
  const { I, c } = map[icone] ?? map.bell;
  return <I className={`h-4 w-4 mt-0.5 flex-shrink-0 ${c}`} />;
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-xs text-gray-600 text-center py-6">{msg}</p>;
}

function tempoRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
