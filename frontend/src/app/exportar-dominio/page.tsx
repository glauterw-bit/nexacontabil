'use client';
import { useState } from 'react';
import {
  Download, FileDown, Loader2, Building2, Settings2, AlertTriangle, CheckCircle2, FileText,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';
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
  const [fonte, setFonte] = useState<'fiscal' | 'contabil'>('fiscal');
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
          fonte,
          layout: { separator, dateFormat, decimalSep },
        }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao gerar');
      const data = await r.json();
      setResult(data);
      if (data.totalLinhas === 0) toast.push(fonte === 'fiscal' ? 'Nenhuma nota fiscal no período (verifique se os XMLs foram capturados)' : 'Nenhum lançamento aprovado no período', { variant: 'info' });
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
      <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
        <EmptyState icon={<Building2 size={34} />} title="Selecione uma empresa." />
        <Link href="/carteira" className="btn-primary">Gerenciar</Link>
      </div>
    );
  }

  return (
    <div className="page-narrow space-y-5">
      <PageHeader
        icon={<FileDown size={22} color={COLORS.acao} />}
        title="Exportar para o Domínio"
        subtitle={`Gera o arquivo de importação de lançamentos contábeis do ${selectedCompany.name}. No Domínio: Utilitários → Importar → Lançamentos e selecione o arquivo baixado.`}
        action={<StatusChip tone="atencao" label="Sem API" size="sm" />}
      />

      <div className="card-aura space-y-4">
        {/* Fonte dos lançamentos */}
        <div>
          <label className="block text-xs text-tx-muted mb-1.5 uppercase tracking-wider">Fonte</label>
          <div className="flex gap-2">
            <button onClick={() => setFonte('fiscal')} className={fonte === 'fiscal' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 13 }}>
              Notas fiscais (XML)
            </button>
            <button onClick={() => setFonte('contabil')} className={fonte === 'contabil' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 13 }}>
              Lançamentos contábeis
            </button>
          </div>
          <p className="text-[11px] text-tx-muted mt-1.5">
            {fonte === 'fiscal'
              ? 'Monta a escrituração a partir das notas do mês (venda → Clientes/Receita; compra → Estoque/Fornecedores; ICMS a recolher). Ajuste o plano de contas depois no Domínio.'
              : 'Exporta os lançamentos contábeis já aprovados no sistema (tabela de lançamentos).'}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-tx-muted mb-1.5 uppercase tracking-wider">Competência</label>
            <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} disabled={todos}
              className="input-aura w-full disabled:opacity-40" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-tx cursor-pointer">
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="accent-indigo-500" />
              {fonte === 'fiscal' ? 'Todas as competências' : 'Todos os lançamentos aprovados'}
            </label>
          </div>
        </div>

        <details className="group">
          <summary className="flex items-center gap-2 text-xs text-tx-muted cursor-pointer hover:text-tx-strong">
            <Settings2 className="h-3.5 w-3.5" /> Layout do arquivo (ajuste se o seu Domínio usar outro formato)
          </summary>
          <div className="grid grid-cols-3 gap-3 mt-3 pl-1">
            <div>
              <label className="block text-[11px] text-tx-muted mb-1">Separador</label>
              <select value={separator} onChange={(e) => setSeparator(e.target.value)} className="input-aura w-full">
                <option value=";">; (ponto-vírgula)</option>
                <option value="|">| (pipe)</option>
                <option value={'\t'}>Tab</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-tx-muted mb-1">Data</label>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as any)} className="input-aura w-full">
                <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                <option value="DDMMYYYY">DDMMAAAA</option>
                <option value="YYYY-MM-DD">AAAA-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-tx-muted mb-1">Decimal</label>
              <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value as any)} className="input-aura w-full">
                <option value=",">vírgula (1234,56)</option>
                <option value=".">ponto (1234.56)</option>
              </select>
            </div>
          </div>
        </details>

        <button onClick={gerar} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar arquivo
        </button>
      </div>

      {result && (
        <div className="card-aura space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Lançamentos" value={result.totalTransacoes} />
            <Stat label="Exportados" value={result.transacoesExportadas} color="text-ok" />
            <Stat label="Linhas geradas" value={result.totalLinhas} />
            <Stat label="Avisos" value={result.avisos?.length ?? 0} color={result.avisos?.length ? 'text-warn' : 'text-tx-muted'} />
          </div>

          {result.totalLinhas > 0 && (
            <button onClick={baixar} className="btn-primary">
              <Download className="h-4 w-4" /> Baixar {result.nomeArquivo}
            </button>
          )}

          {result.conteudo && (
            <div>
              <p className="text-xs text-tx-muted mb-1.5">Prévia (primeiras linhas)</p>
              <pre className="bg-inset border border-line rounded-lg p-3 text-[11px] text-tx overflow-x-auto max-h-48">
{result.conteudo.split('\n').slice(0, 15).join('\n')}
              </pre>
            </div>
          )}

          {result.avisos?.length > 0 && (
            <div className="rounded-lg p-3" style={{ border: '1px solid color-mix(in srgb, var(--atencao) 30%, transparent)', background: 'color-mix(in srgb, var(--atencao) 6%, transparent)' }}>
              <p className="text-xs font-medium text-warn mb-1.5 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Avisos ({result.avisos.length})</p>
              <ul className="space-y-0.5">
                {result.avisos.slice(0, 8).map((a: string, i: number) => <li key={i} className="text-[11px] text-warn">• {a}</li>)}
              </ul>
            </div>
          )}

          {result.totalLinhas > 0 && (
            <div className="flex items-start gap-2 text-xs text-tx-muted border-t border-line pt-3">
              <CheckCircle2 className="h-4 w-4 text-ok flex-shrink-0 mt-0.5" />
              <span>Arquivo em ANSI (Windows-1252), pronto pro Domínio. Importe em <span className="text-tx">Utilitários → Importar → Lançamentos</span>.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text-tx-strong' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-line bg-inset p-3 text-center">
      <p className="text-[11px] text-tx-muted mb-0.5">{label}</p>
      <p className={`num text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
