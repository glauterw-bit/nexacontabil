'use client';
import { X, AlertTriangle, CheckCircle, Scale, FileText } from 'lucide-react';

interface Props {
  doc: { id: string; filename: string; result: any };
  onClose: () => void;
}

export function DocumentReviewModal({ doc, onClose }: Props) {
  const d = doc.result?.extracted_data;
  const fiscal = doc.result?.fiscal_validation;
  const compliance = doc.result?.compliance_check;
  const entries = doc.result?.accounting_suggestions?.[0]?.entries ?? [];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-brand-500" />
            <div>
              <h2 className="text-white font-semibold">{doc.filename}</h2>
              <p className="text-xs text-gray-400">
                {d?.document_type} · Confiança: {((d?.confidence_score ?? 0) * 100).toFixed(0)}%
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dados Extraídos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Dados Extraídos</h3>
            <div className="bg-surface rounded-xl p-4 space-y-2">
              {[
                ['Emitente', d?.issuer_name],
                ['CNPJ', d?.issuer_cnpj],
                ['Número', d?.number],
                ['Emissão', d?.issue_date],
                ['Vencimento', d?.due_date],
                ['Valor Total', d?.total_value ? `R$ ${Number(d.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null],
                ['Pagamento', d?.payment_method],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-white font-medium">{v}</span>
                </div>
              ))}
            </div>

            {d?.taxes?.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Impostos</h3>
                <div className="bg-surface rounded-xl p-4 space-y-2">
                  {d.taxes.map((t: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-500">{t.name} ({t.rate}%)</span>
                      <span className="text-white">R$ {Number(t.value).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Análise IA */}
          <div className="space-y-4">
            {/* Fiscal */}
            {fiscal && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Análise Fiscal</h3>
                <div className={`rounded-xl p-4 border ${
                  fiscal.risk_level === 'BAIXO' ? 'border-green-500/30 bg-green-500/5' :
                  fiscal.risk_level === 'ALTO' ? 'border-red-500/30 bg-red-500/5' :
                  'border-yellow-500/30 bg-yellow-500/5'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    <span className="text-sm text-white">{fiscal.status}</span>
                    <span className={`badge-risk-${fiscal.risk_level?.toLowerCase()}`}>{fiscal.risk_level}</span>
                  </div>
                  {fiscal.warnings?.map((w: string, i: number) => (
                    <p key={i} className="text-xs text-gray-400 mt-1">• {w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Compliance */}
            {compliance && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Compliance</h3>
                <div className="bg-surface rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {compliance.is_deductible
                      ? <CheckCircle className="h-4 w-4 text-green-400" />
                      : <AlertTriangle className="h-4 w-4 text-red-400" />}
                    <span className="text-sm text-white">
                      {compliance.is_deductible ? 'Despesa dedutível' : 'Não dedutível para IRPJ'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{compliance.status}</p>
                </div>
              </div>
            )}

            {/* Lançamento Sugerido */}
            {entries.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Lançamento Sugerido</h3>
                <div className="bg-surface rounded-xl p-4 space-y-2">
                  {entries.map((e: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div>
                        <span className={`font-mono text-xs px-1.5 py-0.5 rounded mr-2 ${
                          e.nature === 'debit' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {e.nature === 'debit' ? 'D' : 'C'}
                        </span>
                        <span className="text-white">{e.account_code}</span>
                        <span className="text-gray-400 ml-2">{e.account_name}</span>
                      </div>
                      <span className="text-white font-mono text-xs">
                        R$ {Number(e.value).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-6 border-t border-surface-border">
          <button onClick={onClose} className="btn-ghost">Fechar</button>
          <button className="btn-primary flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Aprovar Lançamento
          </button>
        </div>
      </div>
    </div>
  );
}
