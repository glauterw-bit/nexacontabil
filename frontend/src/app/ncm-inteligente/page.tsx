'use client';
import { useEffect, useState } from 'react';
import {
  Boxes, Download, RefreshCw, Loader2, Plus, Search, X, Brain, GraduationCap,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Kpi, Spinner, EmptyState, COLORS } from '@/components/ui/kit';

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
    <div className="page space-y-5">
      <PageHeader
        icon={<Boxes size={22} color={COLORS.acao} />}
        title="Banco de NCM Inteligente"
        subtitle="Base única de NCM + tributação por segmento. Alimentada pelos XMLs reais de todos os clientes."
        action={
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-inset border border-line text-tx-muted">Padronização</span>
            <button onClick={aprenderXmls} disabled={aprendendo} className="btn-primary">
              {aprendendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
              Aprender dos XMLs
            </button>
            <button onClick={exportar} className="btn-secondary">
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
            <button onClick={() => setShowForm(true)} className="btn-secondary">
              <Plus className="h-3.5 w-3.5" /> Nova regra
            </button>
          </div>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="flex flex-wrap gap-3">
          <Kpi label="Total de regras" value={stats.total} />
          <Kpi label="Aprendidas de XML" value={stats.aprendidas} />
          <Kpi label="Com Subst. Tributária" value={stats.comSt} cor={COLORS.atencao} />
          <Kpi label="Segmentos" value={stats.porSegmento?.length ?? 0} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar NCM ou descrição…"
            className="input-aura w-full" style={{ paddingLeft: 38 }} />
        </div>
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)} className="input-aura">
          <option value="">Todos segmentos</option>
          {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="btn-secondary" aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* Tabela */}
      <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
        {loading ? (
          <Spinner />
        ) : rules.length === 0 ? (
          <EmptyState icon={<Boxes size={28} />} title="Nenhuma regra."
            sub={'Clique em "Aprender dos XMLs" para popular a base automaticamente.'} />
        ) : (
          <table className="table-aura min-w-[760px]">
            <thead>
              <tr>
                <th>NCM</th>
                <th>Descrição</th>
                <th>Segmento</th>
                <th className="num">ICMS</th>
                <th className="text-center">ST</th>
                <th className="num">IPI</th>
                <th className="num">PIS</th>
                <th className="num">COFINS</th>
                <th>CFOP</th>
                <th className="num">Usos</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-tx-strong">{r.ncm}</td>
                  <td className="max-w-[220px] truncate" title={r.descricao}>{r.descricao}</td>
                  <td><span className="text-[10px] px-2 py-0.5 rounded-full bg-inset border border-line-soft text-tx-muted">{r.segmento}</span></td>
                  <td className="num font-mono text-tx-strong">{r.icmsAliquota}%</td>
                  <td className="text-center">{r.icmsSt ? <span className="text-warn text-xs">SIM</span> : <span className="text-tx-faint text-xs">—</span>}</td>
                  <td className="num font-mono">{r.ipiAliquota}%</td>
                  <td className="num font-mono">{r.pisAliquota}%</td>
                  <td className="num font-mono">{r.cofinsAliquota}%</td>
                  <td className="font-mono text-tx-muted">{r.cfopPadrao ?? '—'}</td>
                  <td className="num text-tx-muted">{r.usosContador}</td>
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

  const inp = 'input-aura w-full';
  return (
    <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-xl p-6 w-full max-w-xl shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-tx-strong m-0">Nova regra NCM</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-tx-muted mb-1">NCM (8 dígitos)</label><input value={f.ncm} onChange={(e) => setF({ ...f, ncm: e.target.value })} className={inp} placeholder="84713012" /></div>
          <div><label className="block text-xs text-tx-muted mb-1">Segmento</label>
            <select value={f.segmento} onChange={(e) => setF({ ...f, segmento: e.target.value })} className={inp}>
              {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="block text-xs text-tx-muted mb-1">Descrição</label><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} className={inp} /></div>
          <div className="col-span-2">
            <button onClick={classificarIA} disabled={iaLoading} className="btn-secondary w-full justify-center">
              {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              Preencher tributação com IA
            </button>
          </div>
          <div><label className="block text-xs text-tx-muted mb-1">ICMS %</label><input value={f.icmsAliquota} onChange={(e) => setF({ ...f, icmsAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-tx-muted mb-1">IPI %</label><input value={f.ipiAliquota} onChange={(e) => setF({ ...f, ipiAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-tx-muted mb-1">PIS %</label><input value={f.pisAliquota} onChange={(e) => setF({ ...f, pisAliquota: e.target.value })} className={inp} /></div>
          <div><label className="block text-xs text-tx-muted mb-1">COFINS %</label><input value={f.cofinsAliquota} onChange={(e) => setF({ ...f, cofinsAliquota: e.target.value })} className={inp} /></div>
          <div className="col-span-2"><label className="block text-xs text-tx-muted mb-1">CFOP padrão</label><input value={f.cfopPadrao} onChange={(e) => setF({ ...f, cfopPadrao: e.target.value })} className={inp} placeholder="5102" /></div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
