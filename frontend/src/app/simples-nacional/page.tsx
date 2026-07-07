'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Award, Calculator, TrendingDown, CheckCircle, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, COLORS, tint, EmptyState, StatusChip, StatusTone } from '@/components/ui/kit';

const LISTAR = gql`
  query ListarApuracoes($companyId: ID!) {
    listarApuracoesSimples(companyId: $companyId) {
      id competencia anexo rbt12 receitaMes aliquotaEfetiva valorDas status codigoBarras
    }
  }
`;
const CALCULAR = gql`
  mutation Calcular($companyId: ID!, $competencia: String!) {
    calcularPGDAS(companyId: $companyId, referenceMonth: $competencia) {
      id competencia anexo rbt12 receitaMes aliquotaEfetiva valorDas status
      aliquotaEfetivaPercent fatorRPercent partilhaDetalhada
    }
  }
`;
const GERAR_DAS = gql`
  mutation GerarDAS($id: ID!) {
    gerarDASSimples(apuracaoId: $id) { id status codigoBarras }
  }
`;
const SIMULAR = gql`
  query Simular($companyId: ID!, $referenceMonth: String!) {
    simularRegimesTributarios(companyId: $companyId, referenceMonth: $referenceMonth) {
      rbr12 receitaMensal melhorRegime economiaMensal
      simplesNacional { aliquota tributacaoMensal tributacaoAnual }
      lucroPresumido { aliquotaEfetiva tributacaoMensal tributacaoAnual }
      lucroReal { aliquotaEfetiva tributacaoMensal tributacaoAnual }
    }
  }
`;

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_TONES: Record<string, StatusTone> = {
  pago: 'ok',
  pgdas_gerado: 'processando',
};

export default function SimplesNacionalPage() {
  const { selectedCompany } = useCompany();
  const [competencia, setCompetencia] = useState(new Date().toISOString().substring(0, 7));
  const [msg, setMsg] = useState('');
  const [showSim, setShowSim] = useState(false);

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR, { variables: { companyId }, skip: !companyId });
  const { data: simData, refetch: runSim } = useQuery(SIMULAR, {
    variables: { companyId, referenceMonth: competencia },
    skip: !companyId || !showSim,
  });

  const [calcular, { data: calcData }] = useMutation(CALCULAR, {
    onCompleted: () => { setMsg('PGDAS calculado!'); refetch(); },
    onError: e => setMsg('Erro: ' + e.message),
  });
  const [gerarDas] = useMutation(GERAR_DAS, {
    onCompleted: () => { setMsg('DAS gerado!'); refetch(); },
  });

  const apuracoes = data?.listarApuracoesSimples ?? [];
  const ultimaCalc = calcData?.calcularPGDAS;
  const sim = simData?.simularRegimesTributarios;

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
        icon={<Award size={22} color={COLORS.acao} />}
        title="Simples Nacional"
        subtitle="PGDAS-D e apuração mensal"
      />

      {msg && (
        <div className="rounded-lg p-3 text-ok text-sm flex items-center gap-2"
          style={{ background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Actions */}
      <div className="card-aura">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-tx-muted text-sm">Competência:</label>
            <input
              type="month"
              value={competencia}
              onChange={e => setCompetencia(e.target.value)}
              className="input-aura"
            />
          </div>
          <button
            onClick={() => calcular({ variables: { companyId, competencia } })}
            className="btn-primary"
          >
            <Calculator className="h-4 w-4" /> Calcular PGDAS
          </button>
          <button
            onClick={() => { setShowSim(true); runSim(); }}
            className="btn-secondary"
          >
            <TrendingDown className="h-4 w-4" /> Simular Regimes
          </button>
        </div>
      </div>

      {/* Resultado do cálculo */}
      {ultimaCalc && (
        <div className="card-aura">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-4">Apuração {ultimaCalc.competencia} — Anexo {ultimaCalc.anexo}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-tx-muted text-xs mb-1">RBT 12 meses</p>
              <p className="text-tx-strong font-bold text-lg num">{fmt(ultimaCalc.rbt12)}</p>
            </div>
            <div className="text-center">
              <p className="text-tx-muted text-xs mb-1">Receita do Mês</p>
              <p className="text-tx-strong font-bold text-lg num">{fmt(ultimaCalc.receitaMes)}</p>
            </div>
            <div className="text-center">
              <p className="text-tx-muted text-xs mb-1">Alíquota Efetiva</p>
              <p className="text-warn font-bold text-lg num">{ultimaCalc.aliquotaEfetivaPercent}%</p>
            </div>
            <div className="text-center">
              <p className="text-tx-muted text-xs mb-1">DAS a Recolher</p>
              <p className="text-ok font-bold text-lg num">{fmt(ultimaCalc.valorDas)}</p>
            </div>
          </div>
          {ultimaCalc.partilhaDetalhada && (
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {Object.entries(ultimaCalc.partilhaDetalhada).map(([k, v]: any) => (
                <div key={k} className="bg-inset rounded-lg p-2 text-center">
                  <p className="text-tx-muted text-xs uppercase">{k}</p>
                  <p className="text-tx-strong text-xs num mt-1">{fmt(v)}</p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => gerarDas({ variables: { id: ultimaCalc.id } })}
            className="btn-primary mt-4"
          >
            <BarChart3 className="h-4 w-4" /> Gerar DAS
          </button>
        </div>
      )}

      {/* Simulação de regimes */}
      {sim && (
        <div className="card-aura">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-4">Simulação de Regimes — Melhor: <span className="text-ok">{sim.melhorRegime}</span></h3>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Simples Nacional', data: sim.simplesNacional, aliqKey: 'aliquota' },
              { label: 'Lucro Presumido', data: sim.lucroPresumido, aliqKey: 'aliquotaEfetiva' },
              { label: 'Lucro Real', data: sim.lucroReal, aliqKey: 'aliquotaEfetiva' },
            ].map(({ label, data: d, aliqKey }) => (
              <div key={label} className="bg-inset border rounded-xl p-4"
                style={{ borderColor: label === sim.melhorRegime ? 'var(--dot-ok)' : 'var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-tx-strong font-medium text-sm m-0">{label}</h4>
                  {label === sim.melhorRegime && <StatusChip tone="ok" label="Melhor" size="sm" />}
                </div>
                <p className="text-2xl font-bold text-tx-strong num">{(d as any)[aliqKey]}%</p>
                <p className="text-tx-muted text-xs mt-1">Alíquota efetiva</p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-tx-muted">Mensal</span>
                    <span className="text-tx-strong num">{fmt(d.tributacaoMensal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-tx-muted">Anual</span>
                    <span className="text-tx-strong num">{fmt(d.tributacaoAnual)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-tx-muted text-sm mt-3">
            Economia máxima: <span className="text-ok font-bold num">{fmt(Number(sim.economiaMensal))}/mês</span>
          </p>
        </div>
      )}

      {/* History */}
      <div>
        <SectionTitle>Histórico de Apurações</SectionTitle>
        <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
          <table className="table-aura">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Anexo</th>
                <th className="num">RBT12</th>
                <th className="num">Receita Mês</th>
                <th className="num">Alíquota</th>
                <th className="num">DAS</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {apuracoes.length === 0 ? (
                <tr><td colSpan={8}><EmptyState icon={<Award size={32} />} title="Nenhuma apuração realizada." /></td></tr>
              ) : apuracoes.map((ap: any) => (
                <tr key={ap.id}>
                  <td className="text-tx-strong font-mono">{ap.competencia}</td>
                  <td className="text-tx-muted">Anexo {ap.anexo}</td>
                  <td className="num text-tx-muted">{fmt(ap.rbt12)}</td>
                  <td className="num text-tx-muted">{fmt(ap.receitaMes)}</td>
                  <td className="num text-warn">{(Number(ap.aliquotaEfetiva) * 100).toFixed(2)}%</td>
                  <td className="num text-ok font-bold">{fmt(ap.valorDas)}</td>
                  <td>
                    <StatusChip tone={STATUS_TONES[ap.status] ?? 'atencao'} label={ap.status} size="sm" />
                  </td>
                  <td>
                    {ap.status === 'calculado' && (
                      <button onClick={() => gerarDas({ variables: { id: ap.id } })} className="text-xs text-acao hover:underline">Gerar DAS</button>
                    )}
                    {ap.codigoBarras && (
                      <span className="text-xs text-tx-faint font-mono block">{ap.codigoBarras.substring(0, 20)}…</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
