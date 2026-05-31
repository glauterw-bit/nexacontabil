'use client';
import { useState } from 'react';
import {
  Download, FileDown, Loader2, Building2, Settings2, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ExportarDominioPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [mesAno, setMesAno] = useState(mesAtual());
  const [todos, setTodos] = useState(false);
  const [separator, setSeparator] = useState(';');
  const [dateFormat, setDateFormat] = useState<'DD/MM/YYYY' | 'DDMMYYYY' | 'YYYY-MM-DD'>('DD/MM/YYYY');
  const [decimalSep, setDecimalSep] = useState<',' | '.'>(',');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function gerar() {
    if (!selectedCompany) return;
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/v1/dominio-export/lancamentos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          companyId: selectedCompany.id,
          mesAno: todos ? undefined : mesAno,
          layout: { separator, dateFormat, decimalSep },
        }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao gerar');
      const data = await r.json();
      setResult(data);
      if (data.totalLinhas === 0) toast.push('Nenhum lançamento aprovado no período', { variant: 'info' });
      else toast.push(`${data.totalLinhas} linhas geradas de ${data.transacoesExportadas} lançamentos`, { variant: 'success' });
    } catch (e: any) {
      toast.push(e.message, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function baixar() {
    if (!result?.conteudoBase64Ansi) return;
    const bin = atob(result.conteudoBase64Ansi);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'text/plain;charset=windows-1252' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = result.nomeArquivo; a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <FileDown className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Exportar para o Domínio</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">Sem API</span>
        </div>
        <p className="text-sm text-gray-400">
          Gera o arquivo de importação de lançamentos contábeis do {selectedCompany.name}. No Domínio:
          <span className="text-gray-300"> Utilitários → Importar → Lançamentos</span> e selecione o arquivo baixado.
        </p>
      </div>

      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Competência</label>
            <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} disabled={todos}
              className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 disabled:opacity-40" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="accent-indigo-500" />
              Exportar todos os lançamentos aprovados
            </label>
          </div>
        </div>

        <details className="group">
          <summary className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-white">
            <Settings2 className="h-3.5 w-3.5" /> Layout do arquivo (ajuste se o seu Domínio usar outro formato)
          </summary>
          <div className="grid grid-cols-3 gap-3 mt-3 pl-1">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Separador</label>
              <select value={separator} onChange={(e) => setSeparator(e.target.value)} className="w-full bg-[#0f1117] border border-[#1e2740] rounded px-2 py-1.5 text-white text-sm">
                <option value=";">; (ponto-vírgula)</option>
                <option value="|">| (pipe)</option>
                <option value={'\t'}>Tab</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Data</label>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as any)} className="w-full bg-[#0f1117] border border-[#1e2740] rounded px-2 py-1.5 text-white text-sm">
                <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                <option value="DDMMYYYY">DDMMAAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Decimal</label>
              <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value as any)} className="w-full bg-[#0f1117] border border-[#1e2740] rounded px-2 py-1.5 text-white text-sm">
                <option value=",">vírgula (1234,56)</option>
                <option value=".">ponto (1234.56)</option>
              </select>
            </div>
          </div>
        </details>

        <button onClick={gerar} disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar arquivo
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Lançamentos" value={result.totalTransacoes} />
            <Stat label="Exportados" value={result.transacoesExportadas} color="text-emerald-400" />
            <Stat label="Linhas geradas" value={result.totalLinhas} color="text-indigo-400" />
            <Stat label="Avisos" value={result.avisos?.length ?? 0} color={result.avisos?.length ? 'text-amber-400' : 'text-gray-400'} />
          </div>

          {result.totalLinhas > 0 && (
            <button onClick={baixar} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg inline-flex items-center gap-2">
              <Download className="h-4 w-4" /> Baixar {result.nomeArquivo}
            </button>
          )}

          {result.conteudo && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Prévia (primeiras linhas)</p>
              <pre className="bg-[#0f1117] border border-[#1e2740] rounded-lg p-3 text-[11px] text-gray-300 overflow-x-auto max-h-48">
{result.conteudo.split('\n').slice(0, 15).join('\n')}
              </pre>
            </div>
          )}

          {result.avisos?.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-300 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Avisos ({result.avisos.length})</p>
              <ul className="space-y-0.5">
                {result.avisos.slice(0, 8).map((a: string, i: number) => <li key={i} className="text-[11px] text-amber-200/80">• {a}</li>)}
              </ul>
            </div>
          )}

          {result.totalLinhas > 0 && (
            <div className="flex items-start gap-2 text-xs text-gray-400 border-t border-[#1e2740] pt-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Arquivo em ANSI (Windows-1252), pronto pro Domínio. Importe em <span className="text-gray-300">Utilitários → Importar → Lançamentos</span>.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#0f1117] p-3 text-center">
      <p className="text-[11px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
