'use client';
import { useEffect, useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { Download, ChevronRight, ChevronDown, Building2, Loader2, AlertCircle, Scale } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { PageHeader, SectionTitle, EmptyState, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const BALANCE_SUMMARY = gql`
  query BalanceSummary($companyId: String!) {
    balanceSummary(companyId: $companyId) {
      total pending approved totalDebit totalCredit
    }
  }
`;

const brl = (n: number | null | undefined) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  grau: number;
  children?: ChartAccount[];
}

export default function BalancoPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? '';
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: summary, loading } = useQuery(BALANCE_SUMMARY, {
    variables: { companyId },
    skip: !companyId,
  });

  const [tree, setTree] = useState<ChartAccount[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoadingTree(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
    fetch(`${API}/api/v1/chart-accounts/tree?companyId=${companyId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => setTree(Array.isArray(d) ? d : []))
      .catch(() => setTree([]))
      .finally(() => setLoadingTree(false));
  }, [companyId]);

  function toggle(id: string) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para ver o Balanço Patrimonial." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  const ativos = tree.filter((c) => c.tipo === 'ativo');
  const passivos = tree.filter((c) => c.tipo === 'passivo');
  const patrimonio = tree.filter((c) => c.tipo === 'patrimonio');

  const s = summary?.balanceSummary;

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Scale size={22} color={COLORS.acao} />}
        title="Balanço Patrimonial"
        subtitle={selectedCompany.name}
        action={
          <button disabled className="btn-secondary" title="Em breve">
            <Download className="h-3.5 w-3.5" />
            PDF
          </button>
        }
      />

      {/* Summary KPIs */}
      {s ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI label="Lançamentos" value={String(s.total)} />
          <KPI label="Aprovados" value={String(s.approved)} color="text-ok" />
          <KPI label="Pendentes" value={String(s.pending)} color={s.pending > 0 ? 'text-warn' : 'text-tx'} />
          <KPI label="Total Débito" value={brl(s.totalDebit)} />
          <KPI label="Total Crédito" value={brl(s.totalCredit)} />
        </div>
      ) : loading ? (
        <div className="text-sm text-tx-muted flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando totais…
        </div>
      ) : null}

      {/* Aviso se plano de contas vazio */}
      {!loadingTree && tree.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex gap-3">
            <AlertCircle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-tx-strong">Plano de contas vazio</p>
              <p className="text-xs text-tx mt-1">
                Para gerar o Balanço Patrimonial é necessário primeiro popular o plano de contas
                desta empresa. Use o seed PCASP (~95 contas brasileiras padrão).
              </p>
              <button
                onClick={async () => {
                  const token = localStorage.getItem('aura_token') ?? '';
                  await fetch(`${API}/api/v1/chart-accounts/seed-pcasp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: JSON.stringify({ companyId }),
                  });
                  window.location.reload();
                }}
                className="btn-primary mt-3"
              >
                Popular plano de contas (PCASP)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saldos: tree do plano de contas com saldos zerados (saldos vêm de Transactions futuro) */}
      {tree.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card-aura">
            <SectionTitle>ATIVO</SectionTitle>
            <Tree nodes={ativos} expanded={expanded} onToggle={toggle} />
          </div>
          <div className="card-aura space-y-4">
            <div>
              <SectionTitle>PASSIVO</SectionTitle>
              <Tree nodes={passivos} expanded={expanded} onToggle={toggle} />
            </div>
            <div className="pt-3 border-t border-line">
              <SectionTitle>PATRIMÔNIO LÍQUIDO</SectionTitle>
              <Tree nodes={patrimonio} expanded={expanded} onToggle={toggle} />
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-tx-faint">
        Os saldos analíticos por conta serão exibidos quando houver lançamentos contábeis (Transactions) com débitos/créditos vinculados ao plano de contas. Hoje
        o sistema gera DRE direto pelos Transactions; o Balanço analítico depende do fechamento contábil com vínculo conta-lançamento.
      </p>
    </div>
  );
}

function Tree({
  nodes, expanded, onToggle, depth = 0,
}: {
  nodes: ChartAccount[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => {
        const hasChildren = (n.children?.length ?? 0) > 0;
        const isExpanded = expanded.has(n.id);
        return (
          <li key={n.id}>
            <button
              onClick={() => hasChildren && onToggle(n.id)}
              className={`w-full flex items-center justify-between py-1 text-left ${hasChildren ? 'hover:bg-inset rounded' : ''}`}
              style={{ paddingLeft: depth * 12 + 4 }}
            >
              <span className="flex items-center gap-1.5">
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="h-3 w-3 text-tx-muted" /> : <ChevronRight className="h-3 w-3 text-tx-muted" />
                ) : (
                  <span className="w-3" />
                )}
                <span className="num text-xs text-tx-faint">{n.codigo}</span>
                <span className={`text-xs ${depth === 0 ? 'font-semibold text-tx-strong' : 'text-tx'}`}>
                  {n.nome}
                </span>
              </span>
              <span className="num text-xs text-tx-faint">{brl(0)}</span>
            </button>
            {hasChildren && isExpanded && (
              <Tree
                nodes={n.children ?? []}
                expanded={expanded}
                onToggle={onToggle}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card-aura">
      <p className="text-xs text-tx-muted">{label}</p>
      <p className={`num text-base font-bold ${color || 'text-tx-strong'}`}>{value}</p>
    </div>
  );
}
