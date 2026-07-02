'use client';
import { useEffect, useState } from 'react';
import {
  Workflow, Play, Loader2, FolderOpen, Mail, MessageCircle, CheckCircle2,
  AlertTriangle, FileText, RefreshCw, ChevronRight, X,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface Connection { id: string; provider: string; label: string; accountEmail: string; }
interface Execucao {
  id: string; status: string; totalArquivos: number; roteados: number; naoRoteados: number;
  comInconsistencia: number; relatoriosEnviados: number; folderName?: string; createdAt: string;
}

export default function EsteiraFiscalPage() {
  const toast = useToast();
  const [conns, setConns] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [enviar, setEnviar] = useState(true);
  const [running, setRunning] = useState(false);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [detalhe, setDetalhe] = useState<any>(null);

  async function loadConns() {
    try {
      const r = await fetch(`${API}/api/v1/cloud/connections`, { headers: authHeaders() });
      const data = await r.json();
      const arr: Connection[] = Array.isArray(data) ? data.filter((c) => c.provider === 'google_drive') : [];
      setConns(arr);
      if (arr.length && !connectionId) setConnectionId(arr[0].id);
    } catch { /* noop */ }
  }
  async function loadExecucoes() {
    try {
      const r = await fetch(`${API}/api/v1/esteira-fiscal/execucoes`, { headers: authHeaders() });
      const data = await r.json();
      setExecucoes(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
  }

  useEffect(() => { loadConns(); loadExecucoes(); }, []);

  async function executar() {
    if (!connectionId) { toast.push('Conecte um Google Drive primeiro', { variant: 'error' }); return; }
    setRunning(true);
    try {
      const r = await fetch(`${API}/api/v1/esteira-fiscal/executar`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ connectionId, folderId: folderId || undefined, enviarRelatorios: enviar }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao executar');
      const res = await r.json();
      toast.push(`Esteira concluída: ${res.roteados}/${res.totalArquivos} roteados · ${res.relatoriosEnviados} relatórios enviados`, { variant: 'success' });
      loadExecucoes();
    } catch (e: any) {
      toast.push(e.message, { variant: 'error' });
    } finally {
      setRunning(false);
    }
  }

  async function abrirDetalhe(id: string) {
    try {
      const r = await fetch(`${API}/api/v1/esteira-fiscal/execucoes/${id}`, { headers: authHeaders() });
      setDetalhe(await r.json());
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Workflow className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Esteira Fiscal Automática</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">Auto</span>
        </div>
        <p className="text-sm text-gray-400">
          Varre uma pasta do Drive, identifica o cliente de cada documento pelo CNPJ, valida a tributação
          contra o Banco de NCM e envia o relatório por e-mail + WhatsApp.
        </p>
      </div>

      {/* Painel de execução */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-4">
        {conns.length === 0 ? (
          <div className="text-center py-6">
            <FolderOpen className="h-8 w-8 mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-400">Nenhum Google Drive conectado.</p>
            <a href="/drive-conectado" className="text-indigo-400 hover:underline text-sm">Conectar Drive →</a>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Conexão Drive</label>
                <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500">
                  {conns.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.accountEmail}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">ID da pasta (opcional)</label>
                <input value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder="vazio = pasta raiz da conexão"
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 placeholder-gray-600" />
              </div>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={enviar} onChange={(e) => setEnviar(e.target.checked)} className="accent-indigo-500" />
                Enviar relatórios automaticamente (e-mail + WhatsApp)
              </label>
              <button onClick={executar} disabled={running}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Processando…' : 'Executar esteira'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Histórico */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white">Execuções recentes</h2>
          <button onClick={loadExecucoes} className="text-gray-500 hover:text-white"><RefreshCw className="h-4 w-4" /></button>
        </div>
        {execucoes.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Nenhuma execução ainda.</p>
        ) : (
          <div className="space-y-2">
            {execucoes.map((e) => (
              <button key={e.id} onClick={() => abrirDetalhe(e.id)}
                className="w-full flex items-center gap-3 p-3 rounded border border-[#1e2740] bg-[#0f1117] hover:border-indigo-500/40 text-left">
                <StatusBadge status={e.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{e.folderName ?? 'Pasta'} · {e.totalArquivos} arquivos</p>
                  <p className="text-xs text-gray-500">
                    {e.roteados} roteados · {e.naoRoteados} sem cliente · {e.comInconsistencia} c/ inconsistência · {e.relatoriosEnviados} relatórios
                  </p>
                </div>
                <span className="text-[11px] text-gray-600">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      {detalhe && <DetalheModal detalhe={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; t: string }> = {
    concluido: { c: 'bg-emerald-500/15 text-emerald-400', t: 'OK' },
    parcial: { c: 'bg-amber-500/15 text-amber-400', t: 'Parcial' },
    erro: { c: 'bg-red-500/15 text-red-400', t: 'Erro' },
    rodando: { c: 'bg-blue-500/15 text-blue-400', t: 'Rodando' },
  };
  const s = map[status] ?? map.rodando;
  return <span className={`px-2 py-0.5 text-[10px] rounded ${s.c} flex-shrink-0`}>{s.t}</span>;
}

function DetalheModal({ detalhe, onClose }: { detalhe: any; onClose: () => void }) {
  const itens = detalhe.itens ?? [];
  const envios = detalhe.envios ?? [];
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Detalhe da execução</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4">
          <h3 className="text-xs uppercase text-gray-500 mb-2">Documentos roteados</h3>
          <div className="space-y-1.5">
            {itens.map((it: any, i: number) => (
              <div key={i} className="p-2.5 rounded border border-[#1e2740] bg-[#161b2e]">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-white truncate flex-1">{it.nome}</span>
                  {it.roteado
                    ? <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{it.companyName}</span>
                    : <span className="text-[10px] text-red-400">sem cliente</span>}
                </div>
                {it.inconsistencias?.length > 0 && (
                  <div className="mt-1.5 pl-5 space-y-0.5">
                    {it.inconsistencias.map((inc: string, j: number) => (
                      <p key={j} className="text-[11px] text-amber-400 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />{inc}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {envios.length > 0 && (
          <div>
            <h3 className="text-xs uppercase text-gray-500 mb-2">Relatórios enviados</h3>
            <div className="space-y-1.5">
              {envios.map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 p-2.5 rounded border border-[#1e2740] bg-[#161b2e]">
                  {e.canal === 'email' ? <Mail className="h-3.5 w-3.5 text-indigo-400" /> : <MessageCircle className="h-3.5 w-3.5 text-green-400" />}
                  <span className="text-sm text-gray-300 flex-1 truncate">{e.destino}</span>
                  <span className={`text-[10px] ${e.status === 'enviado' ? 'text-emerald-400' : 'text-red-400'}`}>{e.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
