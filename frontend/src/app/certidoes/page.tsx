'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, COLORS, tint, EmptyState, StatusChip, StatusTone } from '@/components/ui/kit';

const LISTAR = gql`query ListarCertidoes($companyId: ID!) { listarCertidoes(companyId: $companyId) { id tipo orgaoEmissor status dataEmissao dataValidade numeroControle cnpj } }`;
const VENCIMENTOS = gql`query Vencimentos($companyId: ID!) { verificarVencimentosCertidoes(companyId: $companyId) { vencendo { id tipo orgaoEmissor dataValidade } vencidas { id tipo orgaoEmissor dataValidade } } }`;
const SOLICITAR = gql`mutation Solicitar($companyId: ID!, $tipo: String!) { solicitarCertidao(companyId: $companyId, tipo: $tipo) { id tipo status orgaoEmissor numeroControle } }`;

const STATUS_CHIP: Record<string, { tone: StatusTone; label?: string }> = {
  negativa: { tone: 'ok', label: 'Negativa' },
  positiva: { tone: 'critico', label: 'Positiva' },
  positiva_efeito_negativa: { tone: 'atencao' },
  nao_consultado: { tone: 'pendente' },
  erro: { tone: 'critico' },
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa no menu lateral" />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<ShieldCheck size={22} color={COLORS.acao} />}
        title="Certidões Negativas"
        subtitle="Consulta e monitoramento automático"
        action={
          <button onClick={() => refetch()} className="btn-ghost" title="Atualizar">
            <RefreshCw className="h-5 w-5" />
          </button>
        }
      />

      {msg && (
        <div className="rounded-lg p-3 text-ok text-sm flex items-center gap-2"
          style={{ background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
          <CheckCircle className="h-4 w-4" /> {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Alertas */}
      {(vencendo.length > 0 || vencidas.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {vencidas.length > 0 && (
            <div className="rounded-xl p-4"
              style={{ background: tint(COLORS.dotErro, 8), border: `1px solid ${tint(COLORS.dotErro, 30)}` }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-err" />
                <span className="text-err font-semibold">{vencidas.length} Certidão(ões) Vencida(s)</span>
              </div>
              {vencidas.map((c: any) => (
                <div key={c.id} className="text-sm text-err flex justify-between">
                  <span>{c.tipo} — {c.orgaoEmissor}</span>
                  <span>{fmtDate(c.dataValidade)}</span>
                </div>
              ))}
            </div>
          )}
          {vencendo.length > 0 && (
            <div className="rounded-xl p-4"
              style={{ background: tint(COLORS.dotAtencao, 8), border: `1px solid ${tint(COLORS.dotAtencao, 30)}` }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-warn" />
                <span className="text-warn font-semibold">{vencendo.length} Vencendo em 30 dias</span>
              </div>
              {vencendo.map((c: any) => (
                <div key={c.id} className="text-sm text-warn flex justify-between">
                  <span>{c.tipo} — {c.orgaoEmissor}</span>
                  <span>{diasParaVencer(c.dataValidade)} dias</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Solicit buttons */}
      <div className="card-aura space-y-3">
        <h3 className="text-[15px] font-semibold text-tx-strong m-0">Solicitar Certidão</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {TIPOS_CERTIDAO.map(({ key, label, icon }) => (
            <button
              key={key}
              disabled={loading === key}
              onClick={() => { setLoading(key); solicitar({ variables: { companyId, tipo: key } }); }}
              className="btn-secondary w-full px-4 py-3"
            >
              <span className="text-lg">{icon}</span>
              <span className="text-left flex-1">{label}</span>
              {loading === key ? (
                <RefreshCw className="h-4 w-4 animate-spin text-acao" />
              ) : (
                <Plus className="h-4 w-4 text-tx-muted" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div>
        <SectionTitle>Histórico ({certidoes.length})</SectionTitle>
        <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
          <table className="table-aura">
            <thead><tr>
              <th>Tipo</th>
              <th>Órgão Emissor</th>
              <th>CNPJ</th>
              <th>Status</th>
              <th>Emissão</th>
              <th>Validade</th>
              <th>Código</th>
            </tr></thead>
            <tbody>
              {certidoes.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={<ShieldCheck size={32} />} title="Nenhuma certidão solicitada ainda." /></td></tr>
              ) : certidoes.map((c: any) => {
                const venceu = c.dataValidade && new Date(c.dataValidade) < new Date();
                const dias = c.dataValidade ? diasParaVencer(c.dataValidade) : null;
                const chip = STATUS_CHIP[c.status] || STATUS_CHIP.nao_consultado;
                return (
                  <tr key={c.id}>
                    <td className="text-tx-strong font-medium">{c.tipo.toUpperCase()}</td>
                    <td className="text-tx-muted text-xs">{c.orgaoEmissor}</td>
                    <td className="text-tx-muted font-mono text-xs">{c.cnpj}</td>
                    <td>
                      <StatusChip tone={chip.tone} label={chip.label ?? c.status} size="sm" />
                    </td>
                    <td className="text-tx-muted">{fmtDate(c.dataEmissao)}</td>
                    <td>
                      <span className={venceu ? 'text-err' : dias && dias <= 30 ? 'text-warn' : 'text-tx-muted'}>
                        {fmtDate(c.dataValidade)} {dias !== null && !venceu ? `(${dias}d)` : venceu ? '(VENCIDA)' : ''}
                      </span>
                    </td>
                    <td className="text-tx-faint font-mono text-xs">{c.numeroControle?.substring(0, 20) || '—'}</td>
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
