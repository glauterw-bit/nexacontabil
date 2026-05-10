'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const LISTAR = gql`query ListarCertidoes($companyId: ID!) { listarCertidoes(companyId: $companyId) { id tipo orgao status dataEmissao dataValidade codigoControle cnpjConsultado } }`;
const VENCIMENTOS = gql`query Vencimentos($companyId: ID!) { verificarVencimentosCertidoes(companyId: $companyId) { vencendo { id tipo orgao dataValidade } vencidas { id tipo orgao dataValidade } } }`;
const SOLICITAR = gql`mutation Solicitar($companyId: ID!, $tipo: String!) { solicitarCertidao(companyId: $companyId, tipo: $tipo) { id tipo status orgao codigoControle } }`;

const STATUS_COLORS: Record<string, string> = {
  negativa: 'text-green-400 bg-green-400/10 border-green-400/20',
  positiva: 'text-red-400 bg-red-400/10 border-red-400/20',
  positiva_efeito_negativa: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  nao_consultado: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
  erro: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const TIPOS_CERTIDAO = [
  { key: 'federal', label: 'Federal (RFB + PGFN)', icon: '🏛️' },
  { key: 'estadual', label: 'Estadual (SEFAZ)', icon: '📋' },
  { key: 'municipal', label: 'Municipal (ISS)', icon: '🏢' },
  { key: 'fgts', label: 'FGTS (CEF)', icon: '🏦' },
  { key: 'trabalhista', label: 'Trabalhista (TST)', icon: '⚖️' },
  { key: 'simples', label: 'Simples Nacional', icon: '📊' },
];

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const diasParaVencer = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

export default function CertidoesPage() {
  const { selectedCompany } = useCompany();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR, { variables: { companyId }, skip: !companyId });
  const { data: vencData } = useQuery(VENCIMENTOS, { variables: { companyId }, skip: !companyId });

  const [solicitar] = useMutation(SOLICITAR, {
    onCompleted: d => { setMsg(`Certidão ${d.solicitarCertidao.tipo} obtida: ${d.solicitarCertidao.status}`); setLoading(null); refetch(); },
    onError: e => { setMsg('Erro: ' + e.message); setLoading(null); },
  });

  const certidoes = data?.listarCertidoes ?? [];
  const vencendo = vencData?.verificarVencimentosCertidoes?.vencendo ?? [];
  const vencidas = vencData?.verificarVencimentosCertidoes?.vencidas ?? [];

  if (!selectedCompany) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Selecione uma empresa no menu lateral</p>
          <Link href="/companies" className="mt-4 inline-block text-indigo-400 hover:underline">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Certidões Negativas</h1>
            <p className="text-gray-400 text-sm">Consulta e monitoramento automático</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="text-gray-400 hover:text-white">
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Alertas */}
      {(vencendo.length > 0 || vencidas.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {vencidas.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <span className="text-red-400 font-semibold">{vencidas.length} Certidão(ões) Vencida(s)</span>
              </div>
              {vencidas.map((c: any) => (
                <div key={c.id} className="text-sm text-red-300 flex justify-between">
                  <span>{c.tipo} — {c.orgao}</span>
                  <span>{fmtDate(c.dataValidade)}</span>
                </div>
              ))}
            </div>
          )}
          {vencendo.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-400 font-semibold">{vencendo.length} Vencendo em 30 dias</span>
              </div>
              {vencendo.map((c: any) => (
                <div key={c.id} className="text-sm text-yellow-300 flex justify-between">
                  <span>{c.tipo} — {c.orgao}</span>
                  <span>{diasParaVencer(c.dataValidade)} dias</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Solicit buttons */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-3">
        <h2 className="text-white font-semibold">Solicitar Certidão</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {TIPOS_CERTIDAO.map(({ key, label, icon }) => (
            <button
              key={key}
              disabled={loading === key}
              onClick={() => { setLoading(key); solicitar({ variables: { companyId, tipo: key } }); }}
              className="flex items-center gap-3 bg-[#0f1117] hover:bg-[#1a2035] border border-[#1e2740] hover:border-indigo-500/50 text-white px-4 py-3 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-lg">{icon}</span>
              <span className="text-left flex-1">{label}</span>
              {loading === key ? (
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
              ) : (
                <Plus className="h-4 w-4 text-gray-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1e2740]">
          <h2 className="text-white font-semibold">Histórico ({certidoes.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1e2740] text-gray-400">
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Órgão Emissor</th>
              <th className="px-4 py-3 text-left">CNPJ</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Emissão</th>
              <th className="px-4 py-3 text-left">Validade</th>
              <th className="px-4 py-3 text-left">Código</th>
            </tr></thead>
            <tbody>
              {certidoes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nenhuma certidão solicitada ainda.</td></tr>
              ) : certidoes.map((c: any) => {
                const venceu = c.dataValidade && new Date(c.dataValidade) < new Date();
                const dias = c.dataValidade ? diasParaVencer(c.dataValidade) : null;
                return (
                  <tr key={c.id} className="border-b border-[#1e2740] hover:bg-white/5">
                    <td className="px-4 py-3 text-white font-medium">{c.tipo.toUpperCase()}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{c.orgao}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.cnpjConsultado}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[c.status] || STATUS_COLORS.nao_consultado}`}>
                        {c.status === 'negativa' ? '✓ Negativa' : c.status === 'positiva' ? '✗ Positiva' : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{fmtDate(c.dataEmissao)}</td>
                    <td className="px-4 py-3">
                      <span className={venceu ? 'text-red-400' : dias && dias <= 30 ? 'text-yellow-400' : 'text-gray-400'}>
                        {fmtDate(c.dataValidade)} {dias !== null && !venceu ? `(${dias}d)` : venceu ? '(VENCIDA)' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.codigoControle?.substring(0, 20) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
