'use client';
import { useState, useCallback, useRef } from 'react';
import {
  FolderOpen, Upload, FileText, CheckCircle2, XCircle, Loader2,
  Building2, Sparkles, ChevronDown, ChevronRight, Trash2, Brain, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const ACCEPTED_EXT = ['.pdf', '.xml', '.png', '.jpg', '.jpeg', '.webp'];

type FileEntry = {
  id: string;
  file: File;
  // path including subfolders if from folder picker
  path: string;
  status: 'pending' | 'reading' | 'sending' | 'processing' | 'done' | 'error';
  error?: string;
  result?: any;
  expanded?: boolean;
};

// File System Access API check (Chrome/Edge/Brave/Arc/Opera)
const fsApiSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function shortType(t?: string) {
  const m: Record<string, string> = {
    nfe: 'NF-e', nfse: 'NFS-e', cte: 'CT-e', boleto: 'Boleto', extrato: 'Extrato',
    recibo: 'Recibo', contrato: 'Contrato', outro: 'Outro',
  };
  return m[t || 'outro'] || t || 'Outro';
}

function typeColor(t?: string) {
  const m: Record<string, string> = {
    nfe: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    nfse: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    boleto: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    extrato: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    recibo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    contrato: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  };
  return m[t || ''] || 'bg-gray-500/15 text-gray-300 border-gray-500/30';
}

async function readDirectoryHandle(handle: FileSystemDirectoryHandle, prefix = ''): Promise<File[]> {
  const out: File[] = [];
  // @ts-ignore -- TS lib em algumas versões não tem o iterator tipado
  for await (const [name, entry] of handle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      // attach path as a non-enumerable hint
      Object.defineProperty(file, '__path', { value: path });
      const lower = name.toLowerCase();
      if (ACCEPTED_EXT.some((ext) => lower.endsWith(ext))) {
        out.push(file);
      }
    } else if (entry.kind === 'directory') {
      const sub = await readDirectoryHandle(entry as FileSystemDirectoryHandle, path);
      out.push(...sub);
    }
  }
  return out;
}

async function walkDataTransferItems(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];

  const walk = async (entry: any, prefix = ''): Promise<void> => {
    if (!entry) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      await new Promise<void>((res) =>
        entry.file((file: File) => {
          Object.defineProperty(file, '__path', { value: path });
          const lower = file.name.toLowerCase();
          if (ACCEPTED_EXT.some((ext) => lower.endsWith(ext))) files.push(file);
          res();
        })
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const subs: any[] = await new Promise((res) => reader.readEntries(res));
      for (const sub of subs) await walk(sub, path);
    }
  };

  const roots: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const entry = (it as any).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  await Promise.all(roots.map((r) => walk(r)));
  return files;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:*/*;base64,"
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function detectMediaType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export default function InteligenciaPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [running, setRunning] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setEntries((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        path: (f as any).__path ?? f.name,
        status: 'pending' as const,
      })),
    ]);
  }, []);

  const pickFolder = async () => {
    if (!fsApiSupported()) {
      toast.push('Seu navegador não suporta selecionar pastas. Use Chrome ou Edge, ou arraste a pasta inteira aqui.', {
        variant: 'warning',
        title: 'Compatibilidade',
      });
      return;
    }
    try {
      // @ts-ignore
      const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: 'read' });
      const files = await readDirectoryHandle(handle);
      addFiles(files);
      toast.push(`${files.length} arquivos detectados em "${handle.name}"`, {
        variant: 'success',
        title: 'Pasta lida',
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.push(err?.message ?? 'Erro ao ler pasta', { variant: 'error', title: 'Erro' });
      }
    }
  };

  const pickFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPTED_EXT.join(',');
    input.onchange = () => {
      if (input.files) addFiles(Array.from(input.files));
    };
    input.click();
  };

  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    setDragOver(false);
    if (ev.dataTransfer.items && ev.dataTransfer.items.length) {
      const files = await walkDataTransferItems(ev.dataTransfer.items);
      addFiles(files);
    } else if (ev.dataTransfer.files) {
      addFiles(Array.from(ev.dataTransfer.files));
    }
  };

  const processAll = async () => {
    if (!selectedCompany) {
      toast.push('Selecione uma empresa primeiro.', { variant: 'warning', title: 'Empresa requerida' });
      return;
    }
    const pending = entries.filter((e) => e.status === 'pending' || e.status === 'error');
    if (pending.length === 0) return;

    setRunning(true);
    toast.push(`Enviando ${pending.length} documento(s) para análise IA…`, {
      variant: 'info',
      title: 'Processamento em lote',
    });

    // marca todos como 'reading'
    setEntries((prev) =>
      prev.map((e) => (pending.find((p) => p.id === e.id) ? { ...e, status: 'reading' } : e))
    );

    // concorrência 3 (compatível com rate-limit Claude)
    const CONCURRENCY = 3;
    let cursor = 0;
    const list = [...pending];

    const worker = async () => {
      while (cursor < list.length) {
        const idx = cursor++;
        const ent = list[idx];
        try {
          // ler -> base64
          setEntries((prev) =>
            prev.map((e) => (e.id === ent.id ? { ...e, status: 'reading' } : e))
          );
          const b64 = await fileToBase64(ent.file);

          setEntries((prev) =>
            prev.map((e) => (e.id === ent.id ? { ...e, status: 'sending' } : e))
          );

          const token = localStorage.getItem('aura_token') ?? '';
          const res = await fetch(`${API}/api/v1/documents/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              companyId: selectedCompany.id,
              filename: ent.file.name,
              base64: b64,
              mediaType: detectMediaType(ent.file.name),
            }),
          });

          setEntries((prev) =>
            prev.map((e) => (e.id === ent.id ? { ...e, status: 'processing' } : e))
          );

          if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt.slice(0, 150)}`);
          }
          const data = await res.json();
          setEntries((prev) =>
            prev.map((e) => (e.id === ent.id ? { ...e, status: 'done', result: data.document } : e))
          );
        } catch (err: any) {
          setEntries((prev) =>
            prev.map((e) => (e.id === ent.id ? { ...e, status: 'error', error: err?.message ?? 'erro' } : e))
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);

    const ok = entries.filter((e) => e.status === 'done').length;
    toast.push(`Análise concluída: ${ok} sucesso, ${pending.length - ok} erro(s).`, {
      variant: ok === pending.length ? 'success' : 'warning',
      title: 'Lote finalizado',
    });
  };

  const removeOne = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));
  const toggleExpand = (id: string) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e)));

  const clearDone = () =>
    setEntries((prev) => prev.filter((e) => e.status !== 'done'));

  const totalPending = entries.filter((e) => e.status === 'pending').length;
  const totalDone = entries.filter((e) => e.status === 'done').length;
  const totalError = entries.filter((e) => e.status === 'error').length;
  const totalSize = entries.reduce((acc, e) => acc + e.file.size, 0);

  if (!selectedCompany) {
    return (
      <div className="p-8">
        <EmptyCompany />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Análise IA em lote</h1>
            <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
              Beta
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Aponte uma pasta (local ou de rede mapeada como <code className="text-gray-300">Z:\</code>) e a IA lê, classifica
            e extrai dados de NF-e, NFS-e, boletos, extratos e recibos em paralelo.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg">
          <Building2 className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs text-gray-300 max-w-[200px] truncate">{selectedCompany.name}</span>
        </div>
      </div>

      {/* Drop / pick area */}
      <div
        ref={dropRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed transition-all p-8 text-center ${
          dragOver
            ? 'border-indigo-500/60 bg-indigo-500/5'
            : 'border-[#2a3550] bg-[#0f1117] hover:border-indigo-500/40'
        }`}
      >
        <FolderOpen className="h-10 w-10 text-gray-500 mx-auto mb-3" />
        <p className="text-sm text-white">Arraste uma pasta ou arquivos aqui</p>
        <p className="text-xs text-gray-500 mt-1">
          Suportado: PDF, XML, JPG, PNG, WebP. Subpastas são lidas recursivamente.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={pickFolder}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Selecionar pasta
            {!fsApiSupported() && (
              <span className="text-[10px] opacity-60">(Chrome/Edge)</span>
            )}
          </button>
          <button
            onClick={pickFiles}
            className="px-3 py-1.5 text-xs font-medium bg-[#1e2740] hover:bg-[#2a3550] text-white border border-[#2a3550] rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Selecionar arquivos
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {entries.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-[#161b2e] border border-[#1e2740] rounded-lg">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-300">
              <span className="text-white font-medium">{entries.length}</span> arquivos · {bytes(totalSize)}
            </span>
            <span className="text-amber-400">{totalPending} pendentes</span>
            <span className="text-emerald-400">{totalDone} analisados</span>
            {totalError > 0 && <span className="text-red-400">{totalError} erro(s)</span>}
          </div>
          <div className="flex items-center gap-2">
            {totalDone > 0 && (
              <button
                onClick={clearDone}
                className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Limpar concluídos
              </button>
            )}
            <button
              onClick={processAll}
              disabled={running || totalPending + totalError === 0}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processando…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Analisar com IA
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {entries.length === 0 && (
          <div className="text-center py-10 text-sm text-gray-500">
            Nenhum arquivo carregado ainda.
          </div>
        )}
        {entries.map((e) => (
          <EntryRow
            key={e.id}
            entry={e}
            onRemove={() => removeOne(e.id)}
            onToggle={() => toggleExpand(e.id)}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyCompany() {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-12 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
      <p className="text-sm font-medium text-white">Selecione uma empresa primeiro</p>
      <p className="text-xs text-gray-500 mt-1">
        Use o seletor no menu lateral ou{' '}
        <Link href="/companies" className="text-indigo-400 hover:underline">
          cadastre um cliente
        </Link>
        .
      </p>
    </div>
  );
}

function EntryRow({
  entry,
  onRemove,
  onToggle,
}: {
  entry: FileEntry;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const statusIcon = () => {
    switch (entry.status) {
      case 'pending':
        return <FileText className="h-4 w-4 text-gray-500" />;
      case 'reading':
      case 'sending':
      case 'processing':
        return <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />;
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const statusLabel = () => {
    switch (entry.status) {
      case 'pending':
        return 'Pendente';
      case 'reading':
        return 'Lendo arquivo…';
      case 'sending':
        return 'Enviando…';
      case 'processing':
        return 'Analisando com IA…';
      case 'done':
        return 'Concluído';
      case 'error':
        return 'Erro';
    }
  };

  const r = entry.result;

  return (
    <div className="rounded-lg border border-[#1e2740] bg-[#161b2e] overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={onToggle} className="text-gray-500 hover:text-white">
          {entry.expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <div className="flex-shrink-0">{statusIcon()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{entry.path}</p>
          <p className="text-xs text-gray-500">
            {bytes(entry.file.size)} · {statusLabel()}
            {entry.error && <span className="text-red-400 ml-2">— {entry.error}</span>}
          </p>
        </div>

        {r && (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-medium border rounded ${typeColor(r.type)}`}>
              {shortType(r.type)}
            </span>
            {r.totalValue != null && (
              <span className="text-sm font-mono text-emerald-300">
                R$ {Number(r.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            )}
            {typeof r.confidenceScore === 'number' && (
              <span className="text-[10px] text-gray-500">
                {(r.confidenceScore * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}

        <button onClick={onRemove} className="text-gray-500 hover:text-red-400">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {entry.expanded && r && (
        <div className="px-4 py-3 border-t border-[#1e2740] bg-[#0f1117] text-xs space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {r.number && <Field label="Número" value={r.number} />}
            {r.issueDate && (
              <Field
                label="Emissão"
                value={new Date(r.issueDate).toLocaleDateString('pt-BR')}
              />
            )}
            {r.dueDate && (
              <Field
                label="Vencimento"
                value={new Date(r.dueDate).toLocaleDateString('pt-BR')}
              />
            )}
            {r.issuerCnpj && <Field label="CNPJ Emissor" value={r.issuerCnpj} />}
            {r.issuerName && <Field label="Nome Emissor" value={r.issuerName} />}
            {r.totalValue != null && (
              <Field
                label="Valor Total"
                value={`R$ ${Number(r.totalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              />
            )}
          </div>

          {Array.isArray(r.agentDecisions) && r.agentDecisions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-2 mb-1">
                Sugestões de lançamento
              </p>
              <ul className="space-y-0.5">
                {r.agentDecisions.map((s: string, i: number) => (
                  <li key={i} className="text-gray-300 flex gap-2">
                    <span className="text-indigo-400">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.fiscalValidation?.chaveAcesso && (
            <Field label="Chave de Acesso" value={r.fiscalValidation.chaveAcesso} mono />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-gray-500 text-[10px] uppercase tracking-wider block">{label}</span>
      <span className={`text-gray-200 ${mono ? 'font-mono text-[11px] break-all' : ''}`}>
        {value}
      </span>
    </div>
  );
}
