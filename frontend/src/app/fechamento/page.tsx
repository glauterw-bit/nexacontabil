'use client';
import { useEffect, useState } from 'react';
import {
  CalendarCheck, CheckCircle2, Circle, AlertTriangle, Lock, Unlock,
  ChevronRight, Loader2, Building2, Hash,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface ChecklistItem { key: string; label: string; done: boolean; detail?: string; href?: string; }
interface Closing {
  id: string;
  companyId: string;
  ano: number;
  mes: number;
  status: 'em_andamento' | 'fechado' | 'reaberto';
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedMotivo?: string;
  hash?: string;
  checklist?: ChecklistItem[];
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function FechamentoPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [closing, setClosing] = useState<Closing | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Closing[]>([]);
  const [working, setWorking] = useState(false);

  const companyId = selectedCompany?.id ?? '';

  async function load() {
    if (!companyId) return;
    setLoading(true);
    const token = localStorage.getItem('aura_token') ?? '';
    try {
      const r = await fetch(`${API}/api/v1/period-closing?companyId=${companyId}&ano=${ano}&mes=${mes}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) setClosing(await r.json());
      const h = await fetch(`${API}/api/v1/period-closing/list?companyId=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (h.ok) setHistory(await h.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId, mes, ano]);

  async function fecharPeriodo(force = false) {
    setWorking(true);
    const token = localStorage.getItem('aura_token') ?? '';
    try {
      const r = await fetch(`${API}/api/v1/period-closing/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, ano, mes, forceClose: force }),
      });
      const data = await r.json();
      if (r.ok) {
        toast.push('Período fechado. Lançamentos travados.', { variant: 'success', title: 'Fechamento OK' });
        load();
      } else {
        if (data?.message?.includes('pendente')) {
          if (confirm(`${data.message}\n\nFechar mesmo com pendências?`)) {
            return fecharPeriodo(true);
          }
        } else {
          toast.push(data?.message ?? 'Erro', { variant: 'error' });
        }
      }
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    }
    setWorking(false);
  }

  async function reabrirPeriodo() {
    const motivo = prompt('Motivo da reabertura (mínimo 15 caracteres — fica gravado em audit):');
    if (!motivo || motivo.trim().length < 15) {
      toast.push('Motivo deve ter pelo menos 15 caracteres', { variant: 'warning' });
      return;
    }
    setWorking(true);
    const token = localStorage.getItem('aura_token') ?? '';
    try {
      const r = await fetch(`${API}/api/v1/period-closing/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, ano, mes, motivo }),
      });
      const data = await r.json();
      if (r.ok) {
        toast.push('Período reaberto', { variant: 'success' });
        load();
      } else toast.push(data?.message ?? 'Erro', { variant: 'error' });
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    }
    setWorking(false);
  }

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">Gerenciar</Link>
      </div>
    );
  }

  const done = closing?.checklist?.filter((c) => c.done).length ?? 0;
  const total = closing?.checklist?.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isClosed = closing?.status === 'fechado';

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CalendarCheck className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Fechamento mensal</h1>
          </div>
          <p className="text-sm text-gray-400">{selectedCompany.name}</p>
        </div>
        <input
          type="month"
          value={`${ano}-${String(mes).padStart(2, '0')}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split('-').map(Number);
            setAno(y); setMes(m);
          }}
          className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* Header com status */}
      {loading ? (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : closing ? (
        <>
          <div className={`rounded-xl border p-5 ${isClosed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#1e2740] bg-[#161b2e]'}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {isClosed ? (
                    <Lock className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Unlock className="h-4 w-4 text-amber-400" />
                  )}
                  <h2 className="text-sm font-medium text-white">
                    {MESES[mes - 1]} de {ano} ·{' '}
                    <span className={isClosed ? 'text-emerald-300' : 'text-amber-300'}>
                      {closing.status === 'fechado' ? 'Fechado' : closing.status === 'reaberto' ? 'Reaberto' : 'Em andamento'}
                    </span>
                  </h2>
                </div>
                {isClosed ? (
                  <>
                    <p className="text-xs text-gray-400">
                      Fechado em {closing.closedAt && new Date(closing.closedAt).toLocaleString('pt-BR')} por <strong>{closing.closedBy}</strong>
                    </p>
                    {closing.hash && (
                      <p className="text-[10px] text-gray-600 font-mono mt-1 flex items-center gap-1">
                        <Hash className="h-2.5 w-2.5" />
                        {closing.hash.slice(0, 32)}…
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">
                    Checklist: {done}/{total} concluído ({pct}%)
                  </p>
                )}
              </div>
              <div>
                {isClosed ? (
                  <button
                    onClick={reabrirPeriodo}
                    disabled={working}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg"
                  >
                    {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                    Reabrir período
                  </button>
                ) : (
                  <button
                    onClick={() => fecharPeriodo(false)}
                    disabled={working}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg"
                  >
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Fechar período
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!isClosed && total > 0 && (
              <div className="mt-4 h-2 bg-[#0f1117] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
            <h3 className="text-sm font-medium text-white mb-3">Checklist do fechamento</h3>
            <div className="space-y-2">
              {(closing.checklist ?? []).map((item) => (
                <Link
                  key={item.key}
                  href={item.href ?? '#'}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[#1e2740] bg-[#0f1117] hover:border-indigo-500/30 transition-colors"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-600 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.done ? 'text-white' : 'text-gray-300'}`}>{item.label}</p>
                    {item.detail && (
                      <p className={`text-xs ${item.done ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
                        {item.detail}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </Link>
              ))}
            </div>
          </div>

          {closing.reopenedMotivo && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-white">Este período foi reaberto</p>
                  <p className="text-gray-400 mt-1">
                    Em {closing.reopenedAt && new Date(closing.reopenedAt).toLocaleString('pt-BR')} por <strong>{closing.reopenedBy}</strong>.
                  </p>
                  <p className="text-gray-300 mt-2">Motivo: {closing.reopenedMotivo}</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
          <h3 className="text-sm font-medium text-white mb-3">Histórico</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                <th className="pb-2 font-medium">Período</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Fechado por</th>
                <th className="pb-2 font-medium">Data</th>
                <th className="pb-2 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-white/5">
                  <td className="py-2 text-gray-200">{String(h.mes).padStart(2, '0')}/{h.ano}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      h.status === 'fechado' ? 'bg-emerald-500/15 text-emerald-300' :
                      h.status === 'reaberto' ? 'bg-amber-500/15 text-amber-300' :
                      'bg-gray-500/15 text-gray-300'
                    }`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-gray-400">{h.closedBy ?? '—'}</td>
                  <td className="py-2 text-xs text-gray-400">
                    {h.closedAt ? new Date(h.closedAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="py-2 text-[10px] text-gray-600 font-mono">
                    {h.hash ? h.hash.slice(0, 12) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
