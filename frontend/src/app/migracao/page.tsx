'use client';
import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, COLORS, tint } from '@/components/ui/kit';

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
    <div className="page-narrow space-y-5">
      <PageHeader
        icon={<Upload size={22} color={COLORS.acao} />}
        title="Migração em massa"
        subtitle="Importe clientes em lote a partir de CSV/Excel ou exportação de outros sistemas contábeis."
      />

      {/* Tipo */}
      <div className="card-aura space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTipo('csv')}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors"
            style={tipo === 'csv'
              ? { background: tint(COLORS.acao, 12), borderColor: COLORS.acao, color: COLORS.acao }
              : { background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            CSV / Excel (genérico)
          </button>
          <button
            onClick={() => setTipo('dominio')}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors"
            style={tipo === 'dominio'
              ? { background: tint(COLORS.acao, 12), borderColor: COLORS.acao, color: COLORS.acao }
              : { background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Domínio Sistemas (.txt export)
          </button>
        </div>

        {tipo === 'csv' && (
          <p className="text-[11px] text-tx-muted">
            Formato esperado: colunas <code className="text-tx">cnpj, razao_social, regime, email, telefone</code>{' '}
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
            className="input-aura w-full font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          {tipo === 'csv' && (
            <button
              onClick={doPreview}
              disabled={loading || !conteudo.trim()}
              className="btn-secondary text-xs"
            >
              Preview
            </button>
          )}
          <button
            onClick={() => doImport(true)}
            disabled={loading || !conteudo.trim()}
            className="btn-secondary text-xs"
          >
            Dry-run (sem gravar)
          </button>
          <button
            onClick={() => doImport(false)}
            disabled={loading || !conteudo.trim()}
            className="btn-primary text-xs"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Importar de verdade
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="card-aura">
          <p className="text-xs text-tx-muted mb-2">
            {preview.total} linha(s) válida(s). Amostra das primeiras 10:
          </p>
          <table className="table-aura">
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Razão Social</th>
                <th>Regime</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono">{r.cnpj}</td>
                  <td className="text-tx-strong truncate max-w-[200px]">{r.razaoSocial}</td>
                  <td className="text-tx-muted">{r.regime ?? '—'}</td>
                  <td className="text-tx-muted truncate max-w-[180px]">{r.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="card-aura space-y-2" style={{ borderColor: tint(COLORS.ok, 30), background: tint(COLORS.ok, 5) }}>
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
