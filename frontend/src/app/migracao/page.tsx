'use client';
import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function MigracaoPage() {
  const toast = useToast();
  const [tipo, setTipo] = useState<'csv' | 'dominio'>('csv');
  const [conteudo, setConteudo] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function readFile(f: File) {
    const text = await f.text();
    setConteudo(text);
    setPreview(null); setResult(null);
  }

  async function doPreview() {
    if (!conteudo.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/migration/preview-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ csv: conteudo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'erro');
      setPreview(d);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function doImport(dryRun = false) {
    setLoading(true);
    try {
      const endpoint = tipo === 'dominio' ? 'import-dominio' : 'import-csv';
      const body: any = tipo === 'dominio'
        ? { content: conteudo }
        : { csv: conteudo, dryRun };
      const r = await fetch(`${API}/api/v1/migration/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'erro');
      setResult(d);
      if (d.created > 0) {
        toast.push(`${d.created} empresa(s) importada(s)`, { variant: 'success' });
      }
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Upload className="h-5 w-5 text-acao" />
          <h1 className="text-xl font-semibold text-tx-strong">Migração em massa</h1>
        </div>
        <p className="text-sm text-tx-muted max-w-2xl">
          Importe clientes em lote a partir de CSV/Excel ou exportação de outros sistemas contábeis.
        </p>
      </div>

      {/* Tipo */}
      <div className="rounded-xl border border-line bg-card p-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTipo('csv')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded border ${
              tipo === 'csv'
                ? 'bg-indigo-500/20 border-indigo-500/50 text-acao'
                : 'bg-inset border-line text-tx-muted hover:text-tx-strong'
            }`}
          >
            CSV / Excel (genérico)
          </button>
          <button
            onClick={() => setTipo('dominio')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded border ${
              tipo === 'dominio'
                ? 'bg-indigo-500/20 border-indigo-500/50 text-acao'
                : 'bg-inset border-line text-tx-muted hover:text-tx-strong'
            }`}
          >
            Domínio Sistemas (.txt export)
          </button>
        </div>

        {tipo === 'csv' && (
          <p className="text-[11px] text-tx-muted">
            Formato esperado: colunas <code className="text-acao">cnpj, razao_social, regime, email, telefone</code>{' '}
            (variantes aceitas). Separador vírgula ou ponto-e-vírgula.
          </p>
        )}
        {tipo === 'dominio' && (
          <p className="text-[11px] text-tx-muted">
            Exporte clientes do Domínio em formato texto. O sistema detecta CNPJ + razão social automaticamente.
          </p>
        )}

        <div className="space-y-2">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
            className="text-xs text-tx-muted"
          />
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder={
              tipo === 'csv'
                ? 'cnpj,razao_social,regime,email,telefone\n12345678000190,Empresa Exemplo,SIMPLES_NACIONAL,contato@ex.com,11999998888'
                : 'Cole o conteúdo do arquivo de exportação aqui…'
            }
            rows={8}
            className="w-full px-3 py-2 bg-inset border border-line rounded text-xs text-tx-strong outline-none font-mono"
          />
        </div>

        <div className="flex gap-2">
          {tipo === 'csv' && (
            <button
              onClick={doPreview}
              disabled={loading || !conteudo.trim()}
              className="px-3 py-1.5 text-xs bg-inset hover:bg-card border border-line disabled:opacity-50 text-tx-strong rounded"
            >
              Preview
            </button>
          )}
          <button
            onClick={() => doImport(true)}
            disabled={loading || !conteudo.trim()}
            className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded"
          >
            Dry-run (sem gravar)
          </button>
          <button
            onClick={() => doImport(false)}
            disabled={loading || !conteudo.trim()}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Importar de verdade
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="text-xs text-tx-muted mb-2">
            {preview.total} linha(s) válida(s). Amostra das primeiras 10:
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-tx-muted border-b border-line">
                <th className="pb-1">CNPJ</th>
                <th className="pb-1">Razão Social</th>
                <th className="pb-1">Regime</th>
                <th className="pb-1">E-mail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.sample.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="py-1 font-mono text-tx">{r.cnpj}</td>
                  <td className="py-1 text-tx-strong truncate max-w-[200px]">{r.razaoSocial}</td>
                  <td className="py-1 text-tx-muted">{r.regime ?? '—'}</td>
                  <td className="py-1 text-tx-muted truncate max-w-[180px]">{r.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-ok" />
            <h3 className="text-sm font-medium text-tx-strong">Importação concluída</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded bg-inset border border-line p-2 text-center">
              <p className="text-[10px] text-tx-muted uppercase">Total</p>
              <p className="text-lg font-bold text-tx-strong">{result.total}</p>
            </div>
            <div className="rounded bg-inset border border-line p-2 text-center">
              <p className="text-[10px] text-tx-muted uppercase">Criadas</p>
              <p className="text-lg font-bold text-ok">{result.created}</p>
            </div>
            <div className="rounded bg-inset border border-line p-2 text-center">
              <p className="text-[10px] text-tx-muted uppercase">Pulou (já existe)</p>
              <p className="text-lg font-bold text-warn">{result.skipped}</p>
            </div>
          </div>
          {result.errors?.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-err">
                {result.errors.length} erro(s)
              </summary>
              <pre className="mt-2 p-2 bg-inset rounded text-[10px] text-err overflow-x-auto">
                {JSON.stringify(result.errors, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
