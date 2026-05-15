'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  FolderOpen,
  Upload,
  FileText,
  FileCheck2,
  FileX2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  TrendingUp,
  TrendingDown,
  Calendar,
  Building2,
  Receipt,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useToast } from '@/components/ui/Toast';

type AnalyzeStatus = 'queued' | 'processing' | 'done' | 'error';

interface FileItem {
  id: string;
  filename: string;
  size: number;
  mediaType: string;
  // raw file kept for processing
  file: File;
  status: AnalyzeStatus;
  errorMsg?: string;
  // returned from backend
  result?: {
    document: any;
  };
}

const SUPPORTED_EXTS = ['.pdf', '.xml', '.png', '.jpg', '.jpeg', '.webp'];

function detectMediaType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'xml') return 'application/xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

function isSupported(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_EXTS.some((ext) => lower.endsWith(ext));
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip data:...;base64, prefix
      const comma = result.indexOf(',');
      resolve(comma > -1 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

export default function LotePage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const stats = useMemo(() => {
    const done = files.filter((f) => f.status === 'done').length;
    const err = files.filter((f) => f.status === 'error').length;
    const totalValor = files
      .filter((f) => f.status === 'done' && f.result?.document?.totalValue)
      .reduce((s, f) => s + Number(f.result?.document?.totalValue || 0), 0);
    return { total: files.length, done, err, totalValor };
  }, [files]);

  // ─── File ingestion ──────────────────────────────────────────────────

  function addFiles(fs: File[]) {
    const supported = fs.filter((f) => isSupported(f.name));
    const rejected = fs.length - supported.length;
    if (rejected > 0) {
      toast.push(
        `${rejected} arquivo(s) ignorado(s) — extensoes suportadas: ${SUPPORTED_EXTS.join(', ')}`,
        { variant: 'warning' }
      );
    }
    const items: FileItem[] = supported.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      filename: file.name,
      size: file.size,
      mediaType: detectMediaType(file.name),
      file,
      status: 'queued',
    }));
    setFiles((prev) => [...prev, ...items]);
  }

  // File System Access API (Chrome/Edge): permite escolher pasta inteira
  async function pickFolder() {
    const w = window as any;
    if (!w.showDirectoryPicker) {
      toast.push(
        'Seu navegador não suporta seleção de pasta. Use Chrome/Edge ou arraste a pasta para a área abaixo.',
        { variant: 'warning' }
      );
      return;
    }
    try {
      const dirHandle = await w.showDirectoryPicker({ mode: 'read' });
      const collected: File[] = [];
      async function walk(handle: any, path = '') {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file' && isSupported(entry.name)) {
            const file = await entry.getFile();
            collected.push(file);
          } else if (entry.kind === 'directory') {
            await walk(entry, `${path}${entry.name}/`);
          }
        }
      }
      await walk(dirHandle);
      if (collected.length === 0) {
        toast.push('Nenhum arquivo suportado encontrado na pasta.', { variant: 'info' });
      } else {
        addFiles(collected);
        toast.push(`${collected.length} arquivo(s) carregados da pasta.`, { variant: 'success' });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        toast.push(`Erro ao ler pasta: ${e?.message ?? e}`, { variant: 'error' });
      }
    }
  }

  // Drag & drop (funciona em todos browsers modernos, inclusive Firefox/Safari)
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (!items) return;
    const collected: File[] = [];

    const traverse = async (entry: any): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file: File) => {
            if (isSupported(file.name)) collected.push(file);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const all: any[] = [];
          const readAll = () => {
            reader.readEntries(async (entries: any[]) => {
              if (entries.length === 0) {
                await Promise.all(all.map(traverse));
                resolve();
              } else {
                all.push(...entries);
                readAll();
              }
            });
          };
          readAll();
        } else resolve();
      });
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry?.();
      if (entry) promises.push(traverse(entry));
    }
    Promise.all(promises).then(() => {
      if (collected.length > 0) {
        addFiles(collected);
        toast.push(`${collected.length} arquivo(s) carregados.`, { variant: 'success' });
      }
    });
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? []);
    if (fs.length > 0) addFiles(fs);
    e.target.value = '';
  }

  // ─── Processing ──────────────────────────────────────────────────────

  async function processAll() {
    if (!selectedCompany) {
      toast.push('Selecione uma empresa antes de processar.', { variant: 'warning' });
      return;
    }
    const queue = files.filter((f) => f.status === 'queued');
    if (queue.length === 0) {
      toast.push('Nada a processar.', { variant: 'info' });
      return;
    }
    setProcessing(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
    const concurrency = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const idx = cursor++;
        const item = queue[idx];
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'processing' } : f))
        );
        try {
          const base64 = await fileToBase64(item.file);
          const resp = await fetch(`${API}/api/v1/documents/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              companyId: selectedCompany.id,
              filename: item.filename,
              base64,
              mediaType: item.mediaType,
            }),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: 'done', result: { document: data.document } } : f
            )
          );
        } catch (e: any) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: 'error', errorMsg: e?.message ?? 'erro' } : f
            )
          );
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    setProcessing(false);
    toast.push('Lote processado.', { variant: 'success' });
  }

  function clearAll() {
    setFiles([]);
  }

  function removeOne(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            Análise IA em lote
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Selecione uma pasta inteira ou arraste arquivos. A IA classifica e extrai os dados de
            cada documento (NF-e, NFS-e, XML, boleto, holerite, extrato).
          </p>
        </div>
        {files.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={clearAll}
              disabled={processing}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-[#1e2740] hover:border-red-500/40 transition-colors"
            >
              Limpar
            </button>
            <button
              onClick={processAll}
              disabled={processing || !selectedCompany}
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {processing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Processar com IA ({files.filter((f) => f.status === 'queued').length})
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {!selectedCompany && (
        <div className="px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-amber-300 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Selecione uma empresa no menu lateral antes de processar documentos.
        </div>
      )}

      {/* Stats */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={FileText} label="Total" value={stats.total} />
          <Stat icon={FileCheck2} label="Processados" value={stats.done} accent="text-emerald-400" />
          <Stat icon={FileX2} label="Erros" value={stats.err} accent="text-red-400" />
          <Stat
            icon={TrendingUp}
            label="Valor total extraído"
            value={stats.totalValor.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
            accent="text-indigo-400"
          />
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl px-6 py-12 text-center transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/5'
            : 'border-[#2a3550] bg-[#161b2e]/40 hover:border-[#3a4870]'
        }`}
      >
        <div className="mx-auto h-12 w-12 rounded-full bg-[#161b2e] border border-[#1e2740] flex items-center justify-center mb-4">
          <Upload className="h-5 w-5 text-indigo-400" />
        </div>
        <p className="text-sm font-medium text-white">
          Arraste uma pasta ou arquivos para analisar
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDFs, XMLs (NF-e/NFS-e), imagens — processados em lote pela IA
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={pickFolder}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
          >
            <FolderOpen className="h-4 w-4" />
            Selecionar pasta
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2a3550] text-gray-300 text-sm hover:border-indigo-500/40 hover:text-white transition-colors"
          >
            <FileText className="h-4 w-4" />
            Selecionar arquivos
          </button>
        </div>
        <p className="text-[11px] text-gray-600 mt-3">
          "Selecionar pasta" requer Chrome/Edge/Brave. Em qualquer navegador, arrastar funciona.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={SUPPORTED_EXTS.join(',')}
          onChange={onPickFiles}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <FileRow key={f.id} item={f} onRemove={() => removeOne(f.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: any;
  accent?: string;
}) {
  return (
    <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-lg font-semibold mt-1 ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function FileRow({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const doc = item.result?.document;
  const extracted = doc?.extractedData ?? {};
  const isDone = item.status === 'done';
  const isErr = item.status === 'error';

  return (
    <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <StatusIcon status={item.status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{item.filename}</p>
            <span className="text-xs text-gray-600">{fileSize(item.size)}</span>
            {isDone && doc?.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase">
                {doc.type}
              </span>
            )}
          </div>
          {isErr && (
            <p className="text-xs text-red-400 mt-1">{item.errorMsg ?? 'Erro desconhecido'}</p>
          )}
          {isDone && (
            <ExtractedSummary extracted={extracted} doc={doc} />
          )}
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 transition-colors"
        >
          Remover
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AnalyzeStatus }) {
  if (status === 'queued') return <FileText className="h-5 w-5 text-gray-500 mt-0.5" />;
  if (status === 'processing')
    return <Loader2 className="h-5 w-5 text-indigo-400 mt-0.5 animate-spin" />;
  if (status === 'done')
    return <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5" />;
  return <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />;
}

function ExtractedSummary({ extracted, doc }: { extracted: any; doc: any }) {
  const valor = doc?.totalValue ?? extracted?.valorTotal;
  const emitente = doc?.issuerName ?? extracted?.emitenteNome;
  const cnpj = doc?.issuerCnpj ?? extracted?.emitenteCnpj;
  const emissao = doc?.issueDate ?? extracted?.dataEmissao;
  const sugestoes: string[] = doc?.agentDecisions ?? extracted?.sugestoesContabeis ?? [];
  const confidence = doc?.confidenceScore ?? extracted?.confidence ?? 0;

  return (
    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400">
      {emitente && (
        <div className="flex items-center gap-2">
          <Building2 className="h-3 w-3 text-gray-600" />
          <span className="truncate">
            {emitente}
            {cnpj ? ` · ${cnpj}` : ''}
          </span>
        </div>
      )}
      {valor != null && (
        <div className="flex items-center gap-2">
          <Receipt className="h-3 w-3 text-gray-600" />
          <span className="text-emerald-300 font-medium">
            {Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      )}
      {emissao && (
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-gray-600" />
          <span>{typeof emissao === 'string' ? emissao.slice(0, 10) : String(emissao)}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-gray-600" />
        <span>
          Confiança:{' '}
          <span className={confidence > 0.8 ? 'text-emerald-400' : confidence > 0.5 ? 'text-amber-400' : 'text-red-400'}>
            {Math.round(confidence * 100)}%
          </span>
        </span>
      </div>
      {sugestoes.length > 0 && (
        <div className="md:col-span-2 mt-2 pt-2 border-t border-[#1e2740]">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">
            Sugestão de lançamento contábil
          </p>
          <ul className="space-y-0.5">
            {sugestoes.slice(0, 3).map((s, i) => (
              <li key={i} className="text-gray-300 leading-relaxed">
                · {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
