'use client';
import { useState, useCallback, useEffect } from 'react';
import {
  Search, Sparkles, FileText, Loader2, Filter, Calendar,
  Building2, DollarSign, AlertCircle, ChevronRight, X
} from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

type SearchFilters = {
  type?: string[];
  year?: number;
  monthStart?: number;
  monthEnd?: number;
  issuerKeyword?: string;
  cnpj?: string;
  minValue?: number;
  maxValue?: number;
  keywords?: string[];
};

type DocResult = {
  id: string;
  type: string;
  status: string;
  number?: string;
  issueDate?: string;
  dueDate?: string;
  totalValue?: number;
  issuerCnpj?: string;
  issuerName?: string;
  confidenceScore?: number;
};

const EXAMPLES = [
  'imposto de 2023 da empresa Padaria',
  'notas fiscais acima de 5000 reais em janeiro',
  'DAS dos últimos 6 meses',
  'boletos vencidos do CNPJ 12345678000190',
  'holerites de funcionário',
];

function typeLabel(t: string) {
  const m: Record<string, string> = {
    nfe: 'NF-e', nfse: 'NFS-e', cte: 'CT-e',
    boleto: 'Boleto', extrato: 'Extrato', recibo: 'Recibo',
    contrato: 'Contrato', das: 'DAS', darf: 'DARF',
    holerite: 'Holerite', outro: 'Outro',
  };
  return m[t] || t.toUpperCase();
}

function typeColor(t: string) {
  const m: Record<string, string> = {
    nfe: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    nfse: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    boleto: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    extrato: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    das: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    darf: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    holerite: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  };
  return m[t] || 'bg-gray-500/15 text-gray-300 border-gray-500/30';
}

export default function BuscarPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [results, setResults] = useState<DocResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = useCallback(async (q: string) => {
    if (!selectedCompany) {
      toast.push('Selecione uma empresa antes de buscar.', { variant: 'warning' });
      return;
    }
    if (!q.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const res = await fetch(`${API}/api/v1/documents/search-natural`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          query: q,
          limit: 100,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFilters(data.filters);
      setResults(data.results || []);
      if ((data.results?.length ?? 0) === 0) {
        toast.push('Nenhum documento encontrado com esses filtros.', { variant: 'info' });
      }
    } catch (err: any) {
      toast.push(err?.message ?? 'Erro na busca', { variant: 'error', title: 'Falha' });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(query);
  }

  if (!selectedCompany) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-12 text-center">
          <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Selecione uma empresa</p>
          <Link href="/companies" className="text-xs text-indigo-400 hover:underline mt-1 inline-block">
            Cadastrar cliente →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Busca em linguagem natural</h1>
          <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
            Beta
          </span>
        </div>
        <p className="text-sm text-gray-400">
          Pergunte sobre os documentos da empresa <span className="text-gray-200">{selectedCompany.name}</span> em
          português natural — a IA traduz para filtros e mostra os arquivos correspondentes.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ex.: "imposto de 2023 da empresa X"'
            className="w-full pl-11 pr-32 py-3 bg-[#161b2e] border border-[#1e2740] focus:border-indigo-500/50 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Buscar
              </>
            )}
          </button>
        </div>
      </form>

      {!searched && (
        <div>
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Exemplos</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuery(ex);
                  run(ex);
                }}
                className="px-3 py-1.5 text-xs bg-[#161b2e] hover:bg-[#1e2740] border border-[#1e2740] hover:border-indigo-500/40 rounded-lg text-gray-300 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {filters && searched && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 inline-flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Filtros interpretados:
          </span>
          {filters.type && filters.type.map((t) => (
            <FilterChip key={t} label={typeLabel(t)} />
          ))}
          {filters.year && <FilterChip label={`Ano ${filters.year}`} icon={Calendar} />}
          {filters.monthStart && (
            <FilterChip label={`Mes ${filters.monthStart}${filters.monthEnd && filters.monthEnd !== filters.monthStart ? `-${filters.monthEnd}` : ''}`} icon={Calendar} />
          )}
          {filters.issuerKeyword && (
            <FilterChip label={`"${filters.issuerKeyword}"`} icon={Building2} />
          )}
          {filters.cnpj && <FilterChip label={`CNPJ ${filters.cnpj}`} icon={Building2} />}
          {filters.minValue !== undefined && (
            <FilterChip label={`>= R$ ${filters.minValue.toLocaleString('pt-BR')}`} icon={DollarSign} />
          )}
          {filters.maxValue !== undefined && (
            <FilterChip label={`<= R$ ${filters.maxValue.toLocaleString('pt-BR')}`} icon={DollarSign} />
          )}
        </div>
      )}

      {searched && results.length === 0 && !loading && (
        <div className="text-center py-14 text-sm text-gray-500">
          <FileText className="h-8 w-8 text-gray-600 mx-auto mb-2" />
          <p>Nenhum documento encontrado para essa busca.</p>
          <p className="text-xs mt-1">
            Lembre: a busca opera somente em documentos ja analisados pela IA.
            <br />
            <Link href="/inteligencia" className="text-indigo-400 hover:underline">
              Subir mais documentos →
            </Link>
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            {results.length} documento(s) encontrado(s).
          </p>
          <div className="space-y-2">
            {results.map((d) => (
              <ResultRow key={d.id} doc={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, icon: Icon }: { label: string; icon?: any }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-full">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

function ResultRow({ doc }: { doc: DocResult }) {
  return (
    <Link
      href={`/documents`}
      className="block p-3 bg-[#161b2e] border border-[#1e2740] hover:border-indigo-500/40 rounded-lg transition-all group"
    >
      <div className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`px-2 py-0.5 text-[10px] font-medium border rounded ${typeColor(doc.type)}`}>
              {typeLabel(doc.type)}
            </span>
            {doc.number && (
              <span className="text-xs text-gray-300 font-mono">#{doc.number}</span>
            )}
            {doc.issueDate && (
              <span className="text-xs text-gray-500">
                {new Date(doc.issueDate).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <p className="text-sm text-white truncate">
            {doc.issuerName || 'Emissor não identificado'}
            {doc.issuerCnpj && (
              <span className="text-gray-500 font-mono text-xs ml-2">{doc.issuerCnpj}</span>
            )}
          </p>
        </div>
        {doc.totalValue != null && (
          <span className="text-sm font-mono text-emerald-300 flex-shrink-0">
            R$ {Number(doc.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-indigo-400 transition-colors" />
      </div>
    </Link>
  );
}
