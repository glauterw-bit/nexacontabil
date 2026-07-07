'use client';
import { useEffect, useState } from 'react';
import {
  Scale, Loader2, Building2, AlertTriangle, CheckCircle, Download, RefreshCw,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';
import { PageHeader, EmptyState, Spinner, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Conta {
  codigo: string;
  nome: string;
  saldo: number;
}
interface Grupo {
  codigo: string;
  nome: string;
  contas: Conta[];
  total: number;
}
interface BalanceSheet {
  companyId: string;
  companyName: string;
  asOf: string;
  grupos: Record<string, Grupo>;
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  totalPassivoEPatrimonio: number;
  diferenca: number;
  balanceado: boolean;
  observacao: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function brl(n: number) {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function BalancoPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [asOf, setAsOf] = useState<string>(new Date().toISOString().slice(0, 10));
  const [bs, setBs] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/balance-sheet?companyId=${selectedCompany.id}&asOf=${asOf}`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBs(await r.json());
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro ao carregar balanço', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedCompany?.id, asOf]);

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-5">
      <PageHeader
        icon={<Scale size={22} color={COLORS.acao} />}
        title="Balanço Patrimonial"
        subtitle={`${selectedCompany.name} · conforme NBC TG 26 / Lei 6.404`}
        action={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={asOf}
              onChange={e => setAsOf(e.target.value)}
              className="input-aura"
            />
            <button onClick={load} disabled={loading} className="btn-secondary">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Atualizar
            </button>
          </div>
        }
      />

      {loading && !bs ? (
        <Spinner />
      ) : bs && (
        <>
          <div className={`rounded-xl border p-4 flex gap-3 items-start ${
            bs.balanceado ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
          }`}>
            {bs.balanceado
              ? <CheckCircle className="h-5 w-5 text-ok flex-shrink-0 mt-0.5" />
              : <AlertTriangle className="h-5 w-5 text-warn flex-shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <p className="text-sm font-medium text-tx-strong">
                {bs.balanceado ? 'Balanço fecha' : `Diferença: ${brl(bs.diferenca)}`}
              </p>
              <p className="text-xs text-tx-muted mt-0.5">{bs.observacao}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-tx-muted">Total Ativo</p>
              <p className="num text-base font-semibold text-tx-strong">{brl(bs.totalAtivo)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <BalancoColumn
              title="ATIVO"
              groups={[bs.grupos.ativoCirculante, bs.grupos.ativoNaoCirculante]}
              total={bs.totalAtivo}
            />
            <BalancoColumn
              title="PASSIVO + PATRIMÔNIO"
              groups={[bs.grupos.passivoCirculante, bs.grupos.passivoNaoCirculante, bs.grupos.patrimonioLiquido]}
              total={bs.totalPassivoEPatrimonio}
            />
          </div>

          <p className="text-[10px] text-tx-faint text-center">
            Posição em {new Date(bs.asOf).toLocaleDateString('pt-BR')} · Apenas lançamentos aprovados/pagos.
          </p>
        </>
      )}
    </div>
  );
}

function BalancoColumn({
  title, groups, total,
}: { title: string; groups: Grupo[]; total: number }) {
  return (
    <div className="card-aura p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-tx-strong tracking-wide m-0">{title}</h2>
        <span className="num text-sm font-semibold text-tx-strong">{brl(total)}</span>
      </div>
      <div className="divide-y divide-line-soft">
        {groups.map(g => (
          <div key={g.codigo} className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider text-tx-faint font-semibold">
                {g.codigo} · {g.nome}
              </p>
              <p className="num text-sm text-tx-strong">{brl(g.total)}</p>
            </div>
            {g.contas.length === 0 ? (
              <p className="text-xs text-tx-faint italic">Sem movimento</p>
            ) : (
              <ul className="space-y-1">
                {g.contas.slice(0, 12).map(c => (
                  <li key={c.codigo} className="flex items-center justify-between text-xs">
                    <span className="text-tx-muted truncate">{c.codigo} · {c.nome}</span>
                    <span className="num text-tx flex-shrink-0">{brl(c.saldo)}</span>
                  </li>
                ))}
                {g.contas.length > 12 && (
                  <li className="text-xs text-tx-faint italic">+ {g.contas.length - 12} contas</li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
