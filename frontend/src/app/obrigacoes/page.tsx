'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  ClipboardList, Loader2, CheckCircle, Clock, AlertTriangle, Building2, FileText,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface ObrigacaoItem {
  id: string;
  tipo: string;
  descricao: string;
  competencia: string;
  dataVencimento: string;
  valorEstimado?: number;
  valorPago?: number;
  status: string;
  prioridade: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const GRUPOS = [
  { label: 'Federais (DAS / DARF / GPS)', tipos: ['DAS', 'DARF', 'GPS'] },
  { label: 'FGTS', tipos: ['FGTS'] },
  { label: 'eSocial', tipos: ['ESOCIAL'] },
  { label: 'DCTFWeb / EFD-Reinf', tipos: ['DCTFWeb', 'EFD_REINF'] },
  { label: 'Estaduais / Municipais', tipos: ['ICMS', 'ISS'] },
  { label: 'SPED (Anuais e Mensais)', tipos: ['ECD', 'ECF', 'SPED_FISCAL', 'SPED_CONTRIB'] },
  { label: 'Anuais Simples / MEI', tipos: ['DEFIS', 'DASN-SIMEI'] },
];

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: any }> = {
  pendente: { label: 'Pendente', classes: 'border-gray-500/30 bg-gray-500/10 text-gray-300', icon: FileText },
  em_apuracao: { label: 'Em apuração', classes: 'border-blue-500/30 bg-blue-500/10 text-blue-300', icon: Clock },
  apurada: { label: 'Apurada', classes: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: Clock },
  paga: { label: 'Paga', classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: CheckCircle },
  vencida: { label: 'Vencida', classes: 'border-red-500/30 bg-red-500/10 text-red-300', icon: AlertTriangle },
  isenta: { label: 'Isenta', classes: 'border-gray-500/30 bg-gray-500/10 text-gray-400', icon: CheckCircle },
};

export default function ObrigacoesPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [items, setItems] = useState<ObrigacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState('todos');

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/fiscal-calendar?companyId=${selectedCompany.id}`, { headers: authHeaders() });
      const d = await r.json();
      setItems(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedCompany?.id]);

  const grupoAtual = GRUPOS[activeTab];
  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (!grupoAtual.tipos.includes(i.tipo)) return false;
      if (statusFilter !== 'todos' && i.status !== statusFilter) return false;
      return true;
    });
  }, [items, grupoAtual, statusFilter]);

  async function marcarPaga(id: string, valor: number) {
    try {
      await fetch(`${API}/api/v1/fiscal-calendar/${id}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ valorPago: valor }),
      });
      toast.push('Marcada como paga', { variant: 'success' });
      load();
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    }
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

  const counts = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <ClipboardList className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Obrigações Acessórias</h1>
        </div>
        <p className="text-sm text-gray-400">{selectedCompany.name} · {items.length} obrigação(ões) no ano</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Pendentes" value={counts.pendente ?? 0} color="text-gray-300" />
        <Stat label="Apuradas" value={counts.apurada ?? 0} color="text-amber-400" />
        <Stat label="Pagas" value={counts.paga ?? 0} color="text-emerald-400" />
        <Stat label="Vencidas" value={counts.vencida ?? 0} color="text-red-400" />
        <Stat label="Total" value={items.length} color="text-white" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-[#1e2740] pb-2">
        {GRUPOS.map((g, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t ${
              activeTab === i ? 'bg-indigo-500/15 text-indigo-300 border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'
            }`}
          >{g.label}</button>
        ))}
      </div>

      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded text-sm text-white outline-none"
      >
        <option value="todos">Todos status</option>
        <option value="pendente">Pendentes</option>
        <option value="apurada">Apuradas</option>
        <option value="paga">Pagas</option>
        <option value="vencida">Vencidas</option>
      </select>

      {loading ? (
        <div className="text-center py-10 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <ClipboardList className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Nenhuma obrigação nesta categoria</p>
          <p className="text-xs text-gray-500 mt-1">Vá em <Link href="/agenda" className="text-indigo-400 hover:underline">Agenda Fiscal</Link> e gere o calendário anual.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const cfg = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pendente;
            const Icon = cfg.icon;
            const venc = new Date(o.dataVencimento);
            const dias = Math.ceil((venc.getTime() - Date.now()) / 86400000);
            return (
              <div key={o.id} className={`rounded-lg border p-3 ${cfg.classes}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{o.descricao}</p>
                    <p className="text-[11px] text-gray-400">
                      {o.tipo} · {o.competencia} · vence {venc.toLocaleDateString('pt-BR')}
                      {o.status !== 'paga' && dias >= 0 && ` (em ${dias} dia${dias !== 1 ? 's' : ''})`}
                    </p>
                  </div>
                  {o.valorEstimado != null && (
                    <span className="text-sm font-mono text-white">R$ {o.valorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  )}
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider">{cfg.label}</span>
                  {o.status !== 'paga' && o.status !== 'isenta' && (
                    <button
                      onClick={() => {
                        const v = parseFloat(prompt('Valor pago?', String(o.valorEstimado ?? 0)) ?? '0');
                        if (v > 0) marcarPaga(o.id, v);
                      }}
                      className="px-2 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                    >Marcar paga</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
