'use client';
import { useEffect, useState } from 'react';
import {
  Boxes, Sparkles, Download, RefreshCw, Loader2, Plus, Search, X, Brain, GraduationCap,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

const SEGMENTOS = ['comercio', 'industria', 'servico', 'transporte', 'outro'];

interface Rule {
  id: string; ncm: string; descricao: string; segmento: string;
  icmsAliquota: number; icmsSt: boolean; mvaSt: number; ipiAliquota: number;
  pisAliquota: number; cofinsAliquota: number; cfopPadrao?: string;
  origem: string; confianca: number; usosContador: number;
}

export default function NcmInteligentePage() {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [busca, setBusca] = useState('');
  const [segmento, setSegmento] = useState('');
  const [loading, setLoading] = useState(false);
  const [aprendendo, setAprendendo] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (busca) qs.set('busca', busca);
      if (segmento) qs.set('segmento', segmento);
      const [r1, r2] = await Promise.all([
        fetch(`${API}/api/v1/ncm-inteligente?${qs}`, { headers: authHeaders() }),
        fetch(`${API}/api/v1/ncm-inteligente/estatisticas`, { headers: authHeaders() }),
      ]);
      setRules(await r1.json());
      setStats(await r2.json());
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [busca, segmento]);

  async function aprenderXmls() {
    setAprendendo(true);
    try {
      const r = await fetch(`${API}/api/v1/ncm-inteligente/aprender-xmls`, { method: 'POST', headers: authHeaders() });
      const res = await r.json();
      toast.push(`${res.ncmsDescobertos} NCMs · ${res.regrasCriadas} novas regras · ${res.regrasAtualizadas} atualizadas`, { variant: 'success' });
      load();
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setAprendendo(false); }
  }

  async function exportar() {
    try {
      const r = await fetch(`${API}/api/v1/ncm-inteligente/exportar?formato=csv${segmento ? `&segmento=${segmento}` : ''}`, { headers: authHeaders() });
      const { conteudo } = await r.json();
      const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `banco-ncm${segmento ? `-${segmento}` : ''}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Boxes className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Banco de NCM Inteligente</h1>
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded">Padronização</span>
          </div>
          <p className="text-sm text-gray-400">Base única de NCM + tributação por segmento. Alimentada pelos XMLs reais de todos os clientes.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={aprenderXmls} disabled={aprendendo}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5">
            {aprendendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
            Aprender dos XMLs
          </button>
          <button onClick={exportar} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
          <button onClick={() => setShowForm(true)} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova regra
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total de regras" value={stats.total} />
          <StatCard label="Aprendidas de XML" value={stats.aprendidas} color="text-indigo-400" />
          <StatCard label="Com Subst. Tributária" value={stats.comSt} color="text-amber-400" />
          <StatCard label="Segmentos" value={stats.porSegmento?.length ?? 0} color="text-emerald-400" />
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar NCM ou descrição…"
            className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg pl-10 pr-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 placeholder-gray-600" />
        </div>
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
          className="bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500">
          <option value="">Todos segmentos</option>
          {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="px-3 bg-[#161b2e] border border-[#1e2740] rounded-lg text-gray-400 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            Nenhuma regra. Clique em <span className="text-indigo-400">"Aprender dos XMLs"</span> para popular a base automaticamente.
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                <th className="px-4 py-3 font-medium">NCM</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium text-right">ICMS</th>
                <th className="px-4 py-3 font-medium text-center">ST</th>
                <th className="px-4 py-3 font-medium text-right">IPI</th>
                <th className="px-4 py-3 font-medium text-right">PIS</th>
                <th className="px-4 py-3 font-medium text-right">COFINS</th>
                <th className="px-4 py-3 font-medium">CFOP</th>
                <th className="px-4 py-3 font-medium text-right">Usos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 font-mono text-white">{r.ncm}</td>
                  <td className="px-4 py-2.5 text-gray-300 max-w-[220px] truncate" title={r.descricao}>{r.descricao}</td>
                  <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300">{r.segmento}</span></td>
                  <td className="px-4 py-2.5 text-right font-mono text-white">{r.icmsAliquota}%</td>
                  <td className="px-4 py-2.5 text-center">{r.icmsSt ? <span className="text-amber-400 text-xs">SIM</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">{r.ipiAliquota}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">{r.pisAliquota}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-300">{r.cofinsAliquota}%</td>
                  <td className="px-4 py-2.5 font-mono text-gray-400">{r.cfopPadrao ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{r.usosContador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <FormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} toast={toast} />}
    </div>
  );
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function FormModal({ onClose, onSaved, toast }: { onClose: () => void; onSaved: () => void; toast: any }) {
  const [f, setF] = useState({ ncm: '', descricao: '', segmento: 'comercio', icmsAliquota: '', ipiAliquota: '', pisAliquota: '', cofinsAliquota: '', cfopPadrao: '', uf: 'SP' });
  const [saving, setSaving] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);

  async function classificarIA() {
    if (!f.ncm || !f.descricao) { toast.push('Informe NCM e descrição', { variant: 'error' }); return; }
    setIaLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/ncm-inteligente/classificar-ia`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ncm: f.ncm, descricao: f.descricao, segmento: f.segmento, uf: f.uf }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'IA falhou');
      const s = await r.json();
      setF((p) => ({ ...p,
        icmsAliquota: String(s.icmsAliquota ?? ''), ipiAliquota: String(s.ipiAliquota ?? ''),
        pisAliquota: String(s.pisAliquota ?? ''), cofinsAliquota: String(s.cofinsAliquota ?? ''),
        cfopPadrao: s.cfopPadrao ?? '',
      }));
      toast.push('IA preencheu a tributação — revise antes de salvar', { variant: 'success' });
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setIaLoading(false); }
  }

  async function salvar() {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/v1/ncm-inteligente`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          ncm: f.ncm, descricao: f.descricao, segmento: f.segmento,
          icmsAliquota: parseFloat(f.icmsAliquota) || 0, ipiAliquota: parseFloat(f.ipiAliquota) || 0,
          pisAliquota: parseFloat(f.pisAliquota) || 0, cofinsAliquota: parseFloat(f.cofinsAliquota) || 0,
          cfopPadrao: f.cfopPadrao || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao salvar');
      onSaved();
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setSaving(false); }
  }

  const inp = 'w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500';
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Nova regra NCM</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">NCM (8 dígitos)</label><input value={f.ncm} onChange={(e) => setF({ ...f, ncm: e.target.value })} className={inp} placeholder="84713012" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Segmento</label>
            <select value={f.segmento} onChange={(e) => setF({ ...f, segmento: e.target.value })} className={inp}>
              {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Descrição</label><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} className={inp} /></div>
          <div className="col-span-2">
            <button onClick={classificarIA} disabled={iaLoading} className="w-full px-3 py-2 bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-300 text-sm rounded-lg inline-flex items-center justify-center gap-2">
              {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Preencher tributação com IA
            </button>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">ICMS %</label><input value={f.icmsAliquota} onChange={(e) => setF({ ...f, icmsAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">IPI %</label><input value={f.ipiAliquota} onChange={(e) => setF({ ...f, ipiAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">PIS %</label><input value={f.pisAliquota} onChange={(e) => setF({ ...f, pisAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">COFINS %</label><input value={f.cofinsAliquota} onChange={(e) => setF({ ...f, cofinsAliquota: e.target.value })} className={inp} /></div>
          <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">CFOP padrão</label><input value={f.cfopPadrao} onChange={(e) => setF({ ...f, cfopPadrao: e.target.value })} className={inp} placeholder="5102" /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-[#1e2740] text-gray-300 text-sm rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center justify-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
