'use client';
import { useState } from 'react';
import {
  Sparkles, Loader2, Search, FileText, CheckSquare, Square, Brain,
  ExternalLink, Save, Printer, AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useCompany } from '@/contexts/CompanyContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface FileResult {
  id: string; name: string; mimeType?: string; modifiedTime?: string;
  size?: number; webViewLink?: string;
  _connectionId: string; _provider: string; _connectionLabel: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function bytes(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const EXAMPLES = [
  'Analisa todas as notas fiscais de janeiro de 2026',
  'Resume os contratos com o cliente Padaria',
  'Compare a folha de pagamento dos últimos 3 meses',
  'Encontra holerites do funcionário João',
  'Liste boletos pagos esse mês',
];

export default function CopilotDrivePage() {
  const toast = useToast();
  const { selectedCompany } = useCompany();
  const [query, setQuery] = useState('');
  const [instruction, setInstruction] = useState('');
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [filters, setFilters] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<any>(null);
  const [step, setStep] = useState<'search' | 'select' | 'analyze' | 'done'>('search');

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]); setAnalysis(null); setSelected(new Set());
    try {
      const r = await fetch(`${API}/api/v1/cloud/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ query, companyId: selectedCompany?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setResults(d.results ?? []);
      setFilters(d.filters);
      setStep('select');
      if (d.errors?.length) {
        toast.push(d.errors.join('; '), { variant: 'warning', title: 'Algumas conexões falharam' });
      }
      if ((d.results ?? []).length === 0) {
        toast.push('Nenhum arquivo encontrado. Tente outros termos ou conecte mais drives.', { variant: 'info' });
      }
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setSearching(false);
    }
  }

  function toggle(id: string) {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelected(newSet);
  }

  function selectAll() {
    setSelected(new Set(results.map((r) => r.id)));
  }

  async function analyze() {
    if (selected.size === 0) {
      toast.push('Selecione ao menos 1 arquivo', { variant: 'warning' });
      return;
    }
    setAnalyzing(true);
    try {
      const files = results
        .filter((r) => selected.has(r.id))
        .map((r) => ({ connectionId: r._connectionId, fileId: r.id, name: r.name }));
      const r = await fetch(`${API}/api/v1/cloud/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ files, instruction: instruction || query, companyId: selectedCompany?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
      setAnalysis(d);
      setStep('done');
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setAnalyzing(false);
    }
  }

  function newQuery() {
    setQuery(''); setInstruction(''); setResults([]);
    setSelected(new Set()); setAnalysis(null); setFilters(null);
    setStep('search');
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Brain className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Copilot Drive (IA + Google + OneDrive)</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">Beta</span>
        </div>
        <p className="text-sm text-gray-400">
          Pergunte em português. A IA busca em todos os drives conectados e gera análise contábil.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        <StepBadge active={step === 'search'} done={step !== 'search'}>1. Pergunta</StepBadge>
        <div className="flex-1 h-px bg-[#1e2740]" />
        <StepBadge active={step === 'select'} done={step === 'analyze' || step === 'done'}>2. Selecionar arquivos</StepBadge>
        <div className="flex-1 h-px bg-[#1e2740]" />
        <StepBadge active={step === 'analyze'} done={step === 'done'}>3. Análise</StepBadge>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder='Ex.: "todas as notas fiscais de janeiro de 2026"'
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
          />
          <button
            onClick={search}
            disabled={searching || !query.trim()}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </button>
        </div>
        {step === 'search' && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setQuery(ex)}
                className="px-2.5 py-1 text-[11px] bg-[#0f1117] hover:bg-[#1e2740] border border-[#1e2740] hover:border-indigo-500/40 rounded text-gray-300 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filtros interpretados */}
      {filters && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-gray-500">IA interpretou:</span>
          {filters.year && <Chip>Ano {filters.year}</Chip>}
          {filters.monthStart && <Chip>Mês {filters.monthStart}{filters.monthEnd ? `-${filters.monthEnd}` : ''}</Chip>}
          {filters.type?.map((t: string) => <Chip key={t}>{t.toUpperCase()}</Chip>)}
          {filters.issuerKeyword && <Chip>&quot;{filters.issuerKeyword}&quot;</Chip>}
          {filters.cnpj && <Chip>CNPJ {filters.cnpj}</Chip>}
        </div>
      )}

      {/* Resultados */}
      {results.length > 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">
              {results.length} arquivo(s) encontrado(s) · {selected.size} selecionado(s)
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-indigo-400 hover:underline">
                Selecionar todos
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-300">
                Limpar
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {results.map((f) => (
              <label
                key={f.id}
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                  selected.has(f.id) ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-[#1e2740] bg-[#0f1117] hover:border-[#2a3550]'
                }`}
              >
                <button onClick={(e) => { e.preventDefault(); toggle(f.id); }} className="flex-shrink-0">
                  {selected.has(f.id) ? (
                    <CheckSquare className="h-4 w-4 text-indigo-400" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-600" />
                  )}
                </button>
                <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {f._connectionLabel} · {bytes(f.size)}
                    {f.modifiedTime && ` · ${new Date(f.modifiedTime).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                {f.webViewLink && (
                  <a
                    href={f.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-gray-500 hover:text-indigo-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </label>
            ))}
          </div>

          {/* Botão analisar */}
          {selected.size > 0 && step === 'select' && (
            <div className="pt-3 border-t border-[#1e2740] space-y-2">
              <input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Instrução para a IA (opcional, ex: 'consolidar totais por fornecedor')"
                className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none"
              />
              <button
                onClick={analyze}
                disabled={analyzing}
                className="w-full px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Baixando, processando e analisando com IA…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Analisar {selected.size} arquivo(s)</>
                )}
              </button>
              <p className="text-[10px] text-gray-500 text-center">
                Limite: 30 arquivos · até 25 MB cada · análise dura 10s-2 min
              </p>
            </div>
          )}
        </div>
      )}

      {/* Resultado da análise */}
      {analysis && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4 print:bg-white print:text-gray-900">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400 print:text-emerald-700" />
                <h3 className="text-sm font-medium text-white print:text-gray-900">Análise IA</h3>
              </div>
              <p className="text-[11px] text-gray-500 print:text-gray-600">
                {analysis.filesAnalyzed} arquivo(s) processado(s)
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => window.print()}
                className="px-2.5 py-1 text-[11px] bg-[#1e2740] hover:bg-[#2a3550] text-gray-200 rounded inline-flex items-center gap-1 print:hidden"
              >
                <Printer className="h-3 w-3" /> PDF
              </button>
              <button
                onClick={newQuery}
                className="px-2.5 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white rounded print:hidden"
              >
                Nova consulta
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-[#0f1117] print:bg-gray-50 border border-[#1e2740] print:border-gray-300 p-4">
            <p className="text-sm text-gray-100 print:text-gray-900 whitespace-pre-wrap leading-relaxed">
              {analysis.summary}
            </p>
          </div>

          {analysis.individualAnalyses && analysis.individualAnalyses.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-200">
                Ver dados extraídos de cada arquivo ({analysis.individualAnalyses.length})
              </summary>
              <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                {analysis.individualAnalyses.map((a: any, i: number) => (
                  <div key={i} className="p-2 rounded bg-[#0f1117] print:bg-gray-50 border border-[#1e2740] print:border-gray-300">
                    <p className="text-white print:text-gray-900 font-medium truncate">{a.filename}</p>
                    {a.error ? (
                      <p className="text-red-300 print:text-red-700 mt-1">{a.error}</p>
                    ) : (
                      <pre className="text-[10px] text-gray-400 print:text-gray-700 mt-1 overflow-x-auto">
                        {JSON.stringify(a.extracted, null, 2).slice(0, 500)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StepBadge({ active, done, children }: any) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
      done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : active ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
      : 'border-[#2a3550] bg-[#161b2e] text-gray-500'
    }`}>{children}</span>
  );
}

function Chip({ children }: any) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
      {children}
    </span>
  );
}
