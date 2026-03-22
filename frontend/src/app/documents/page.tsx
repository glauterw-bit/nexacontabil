'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { DocumentReviewModal } from '@/components/forms/DocumentReviewModal';

interface ProcessedDoc {
  id: string;
  filename: string;
  status: string;
  result: any;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<ProcessedDoc[]>([]);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState<ProcessedDoc | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    setProcessing(true);
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('company_id', 'company-demo-001');

        const res = await axios.post(
          `${process.env.NEXT_PUBLIC_AI_URL}/api/v1/documents/upload`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        setDocs(prev => [{
          id: res.data.document_id,
          filename: file.name,
          status: res.data.status,
          result: res.data,
        }, ...prev]);
      } catch (err: any) {
        setDocs(prev => [{
          id: crypto.randomUUID(),
          filename: file.name,
          status: 'failed',
          result: { error: err.message },
        }, ...prev]);
      }
    }
    setProcessing(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.tiff'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const statusIcon = (s: string) => {
    if (s === 'completed') return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (s === 'failed') return <AlertTriangle className="h-4 w-4 text-red-400" />;
    return <Loader2 className="h-4 w-4 text-brand-500 animate-spin" />;
  };

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold text-white">Processamento de Documentos</h1>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-surface-border hover:border-brand-500/50 hover:bg-white/5'
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
          <div className="mt-4 flex items-center justify-center gap-2 text-brand-500">
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
              className="flex items-center gap-4 p-4 bg-surface rounded-lg border border-surface-border hover:border-brand-500/40 transition-colors"
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
        <DocumentReviewModal
          doc={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
