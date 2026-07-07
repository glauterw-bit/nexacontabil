'use client';
import { useEffect, useState } from 'react';
import {
  CalendarCheck, CheckCircle2, Circle, AlertTriangle, Lock, Unlock,
  ChevronRight, Loader2, Building2, Hash,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, SectionTitle, StatusChip, EmptyState, Spinner, COLORS } from '@/components/ui/kit';

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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar</Link>
        </div>
      </div>
    );
  }

  const done = closing?.checklist?.filter((c) => c.done).length ?? 0;
  const total = closing?.checklist?.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isClosed = closing?.status === 'fechado';

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<CalendarCheck size={22} color={COLORS.acao} />}
        title="Fechamento mensal"
        subtitle={selectedCompany.name}
        action={
          <input
            type="month"
            value={`${ano}-${String(mes).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setAno(y); setMes(m);
            }}
            className="input-aura"
          />
        }
      />

      {/* Header com status */}
      {loading ? (
        <Spinner />
      ) : closing ? (
        <>
          <div className={`rounded-xl border p-5 ${isClosed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-line bg-card'}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {isClosed ? (
                    <Lock className="h-4 w-4 text-ok" />
                  ) : (
                    <Unlock className="h-4 w-4 text-warn" />
                  )}
                  <h2 className="text-sm font-medium text-tx-strong">
                    {MESES[mes - 1]} de {ano} ·{' '}
                    <span className={isClosed ? 'text-ok' : 'text-warn'}>
                      {closing.status === 'fechado' ? 'Fechado' : closing.status === 'reaberto' ? 'Reaberto' : 'Em andamento'}
                    </span>
                  </h2>
                </div>
                {isClosed ? (
                  <>
                    <p className="text-xs text-tx-muted">
                      Fechado em {closing.closedAt && new Date(closing.closedAt).toLocaleString('pt-BR')} por <strong>{closing.closedBy}</strong>
                    </p>
                    {closing.hash && (
                      <p className="text-[10px] text-tx-faint font-mono mt-1 flex items-center gap-1">
                        <Hash className="h-2.5 w-2.5" />
                        {closing.hash.slice(0, 32)}…
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-tx-muted">
                    Checklist: {done}/{total} concluído ({pct}%)
                  </p>
                )}
              </div>
              <div>
                {isClosed ? (
                  <button onClick={reabrirPeriodo} disabled={working} className="btn-secondary">
                    {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                    Reabrir período
                  </button>
                ) : (
                  <button onClick={() => fecharPeriodo(false)} disabled={working} className="btn-primary">
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Fechar período
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!isClosed && total > 0 && (
              <div className="mt-4 h-2 bg-inset rounded-full overflow-hidden">
                <div
                  className="h-full bg-acao transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="card-aura">
            <SectionTitle>Checklist do fechamento</SectionTitle>
            <div className="space-y-2">
              {(closing.checklist ?? []).map((item) => (
                <Link
                  key={item.key}
                  href={item.href ?? '#'}
                  className="flex items-center gap-3 p-3 rounded-lg border border-line bg-inset hover:border-indigo-500/30 transition-colors"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-ok flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-tx-faint flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${item.done ? 'text-tx-strong' : 'text-tx'}`}>{item.label}</p>
                    {item.detail && (
                      <p className={`text-xs ${item.done ? 'text-ok' : 'text-warn/80'}`}>
                        {item.detail}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-tx-faint" />
                </Link>
              ))}
            </div>
          </div>

          {closing.reopenedMotivo && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-tx-strong">Este período foi reaberto</p>
                  <p className="text-tx-muted mt-1">
                    Em {closing.reopenedAt && new Date(closing.reopenedAt).toLocaleString('pt-BR')} por <strong>{closing.reopenedBy}</strong>.
                  </p>
                  <p className="text-tx mt-2">Motivo: {closing.reopenedMotivo}</p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="card-aura">
          <SectionTitle>Histórico</SectionTitle>
          <table className="table-aura">
            <thead>
              <tr>
                <th>Período</th>
                <th>Status</th>
                <th>Fechado por</th>
                <th>Data</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="num text-tx" style={{ textAlign: 'left' }}>{String(h.mes).padStart(2, '0')}/{h.ano}</td>
                  <td>
                    <StatusChip
                      size="sm"
                      tone={h.status === 'fechado' ? 'ok' : h.status === 'reaberto' ? 'atencao' : 'pendente'}
                      label={h.status}
                    />
                  </td>
                  <td className="text-xs text-tx-muted">{h.closedBy ?? '—'}</td>
                  <td className="text-xs text-tx-muted">
                    {h.closedAt ? new Date(h.closedAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="text-[10px] text-tx-faint font-mono">
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
