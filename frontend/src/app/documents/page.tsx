'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Eye, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/contexts/CompanyContext';
import { DocumentReviewModal } from '@/components/forms/DocumentReviewModal';

interface ProcessedDoc {
  id: string;
  filename: string;
  status: string;
  result: any;
}

export default function DocumentsPage() {
  const { selectedCompany } = useCompany();
  const [docs, setDocs] = useState<ProcessedDoc[]>([]);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState<ProcessedDoc | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    if (!selectedCompany) return;
    setProcessing(true);
    const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
    const token = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    for (const file of files) {
      const docId = crypto.randomUUID();
      setDocs(prev => [{ id: docId, filename: file.name, status: 'processing', result: null }, ...prev]);
      try {
        const form = new FormData();
        form.append('file', file);

        const res = await axios.post(
          `${API}/api/v1/ai/ocr`,
          form,
          { headers: { ...authHeader, 'Content-Type': 'multipart/form-data' } }
        );

        setDocs(prev => prev.map(d => d.id === docId
          ? { ...d, status: 'completed', result: res.data }
          : d));
      } catch (err: any) {
        setDocs(prev => prev.map(d => d.id === docId
          ? { ...d, status: 'failed', result: { error: err?.response?.data?.message ?? err.message } }
          : d));
      }
    }
    setProcessing(false);
  }, [selectedCompany]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    disabled: !selectedCompany,
  });

  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (s === 'failed') return <AlertTriangle className="h-4 w-4 text-red-400" />;
    return <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />;
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa na barra lateral para enviar documentos.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Documentos</h1>
        <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-[#1e2740] hover:border-indigo-500/50 hover:bg-white/5'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-12 w-12 mx-auto text-gray-500 mb-4" />
        <p className="text-white font-medium mb-1">
          {isDragActive ? 'Solte os arquivos aqui' : 'Arraste documentos ou clique para selecionar'}
        </p>
        <p className="text-gray-400 text-sm">
          Notas Fiscais, Boletos, Extratos — JPG, PNG, PDF (até 20MB)
        </p>
        {processing && (
          <div className="mt-4 flex items-center justify-center gap-2 text-indigo-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Processando com IA...</span>
          </div>
        )}
      </div>

      {/* Documents List */}
      {docs.length > 0 && (
        <div className="card-aura space-y-3">
          <h2 className="text-lg font-semibold text-white mb-4">Documentos Processados</h2>
          {docs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-4 bg-[#0f1117] rounded-lg border border-[#1e2740] hover:border-indigo-500/40 transition-colors"
            >
              <FileText className="h-8 w-8 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-1">
                  {statusIcon(doc.status)}
                  <span className="text-xs text-gray-400 capitalize">{doc.status}</span>
                  {doc.result?.extracted_data?.total_value && (
                    <span className="text-xs text-gray-400">
                      · R$ {Number(doc.result.extracted_data.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {doc.result?.compliance_check?.risk_level && (
                    <span className={`badge-risk-${doc.result.compliance_check.risk_level.toLowerCase()}`}>
                      {doc.result.compliance_check.risk_level}
                    </span>
                  )}
                </div>
              </div>
              {doc.status === 'completed' && (
                <button
                  onClick={() => setSelected(doc)}
                  className="btn-ghost flex items-center gap-2 text-sm"
                >
                  <Eye className="h-4 w-4" />
                  Revisar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DocumentReviewModal doc={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
