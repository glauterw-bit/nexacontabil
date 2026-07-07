'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Calculator, CheckCircle, AlertTriangle, TrendingUp, DollarSign, Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, COLORS, tint, EmptyState, Spinner, StatusChip } from '@/components/ui/kit';

const GET_MEI = gql`
  query GetMei($companyId: String!) {
    meiApuracoes(companyId: $companyId) {
      id competencia tipo receitaComercio receitaServicos receitaTotal
      dasValor dasInss dasIss dasIcms status dataPagamento percentualUsado
    }
    meiResumo(companyId: $companyId) {
      receitaAnual percentualUsado limiteRestante dasPago dasPendente emRisco
    }
  }
`;

const CALCULAR = gql`
  mutation CalcDasMei($companyId: String!, $competencia: String!, $receitaComercio: Float!, $receitaServicos: Float!) {
    calcularDasMei(companyId: $companyId, competencia: $competencia, receitaComercio: $receitaComercio, receitaServicos: $receitaServicos) { id }
  }
`;

const PAGAR = gql`mutation PagarDasMei($id: String!) { pagarDasMei(id: $id) { id status } }`;

export default function MeiPage() {
  const { selectedCompany } = useCompany();
  const [form, setForm] = useState({ competencia: '', receitaComercio: '', receitaServicos: '' });
  const [showForm, setShowForm] = useState(false);

  const { data, loading, refetch } = useQuery(GET_MEI, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [calcular] = useMutation(CALCULAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [pagar] = useMutation(PAGAR, { onCompleted: () => refetch() });

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa" />
      </div>
    );
  }

  const resumo = data?.meiResumo;
  const apuracoes = data?.meiApuracoes ?? [];

  const handleCalc = (e: React.FormEvent) => {
    e.preventDefault();
    calcular({
      variables: {
        companyId: selectedCompany.id,
        competencia: form.competencia,
        receitaComercio: parseFloat(form.receitaComercio || '0'),
        receitaServicos: parseFloat(form.receitaServicos || '0'),
      },
    });
  };

  const pct = resumo ? parseFloat(resumo.percentualUsado) : 0;

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Calculator size={22} color={COLORS.acao} />}
        title="MEI — DAS / DASN-SIMEI"
        subtitle="Apuração mensal e DASN anual do Microempreendedor Individual"
        action={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Calculator className="h-4 w-4" /> Calcular DAS
          </button>
        }
      />

      {/* Resumo anual */}
      {resumo && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 card-aura"
            style={resumo.emRisco ? { borderColor: 'var(--dot-erro)' } : undefined}>
            <div className="flex items-center gap-2 mb-3">
              {resumo.emRisco ? <AlertTriangle className="h-4 w-4 text-err" /> : <TrendingUp className="h-4 w-4 text-ok" />}
              <p className="text-xs text-tx-muted">Limite Anual (R$ 81.000)</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-tx-muted">Utilizado</span>
                <span className={`font-bold num ${resumo.emRisco ? 'text-err' : 'text-tx-strong'}`}>{resumo.percentualUsado}%</span>
              </div>
              <div className="h-2 bg-inset rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(pct, 100)}%`,
                    background: pct >= 80 ? 'var(--dot-erro)' : pct >= 60 ? 'var(--dot-atencao)' : 'var(--dot-ok)',
                  }} />
              </div>
              <p className="text-xs text-tx-muted num">Restante: R$ {resumo.limiteRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="card-aura">
            <div className="flex items-center gap-2 mb-2"><CheckCircle className="h-4 w-4 text-ok" /><p className="text-xs text-tx-muted">DAS Pago (ano)</p></div>
            <p className="text-2xl font-bold text-ok num">R$ {resumo.dasPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="card-aura">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-warn" /><p className="text-xs text-tx-muted">DAS Pendente</p></div>
            <p className="text-2xl font-bold text-warn num">R$ {resumo.dasPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl shadow-pop p-6 w-full max-w-md">
            <h2 className="text-[15px] font-semibold text-tx-strong mb-4">Calcular DAS MEI</h2>
            <form onSubmit={handleCalc} className="space-y-4">
              <div>
                <label className="block text-xs text-tx-muted mb-1">Competência (YYYY-MM)</label>
                <input type="text" placeholder="2025-01" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))}
                  className="input-aura w-full" required />
              </div>
              <div>
                <label className="block text-xs text-tx-muted mb-1">Receita Comércio (R$)</label>
                <input type="number" step="0.01" placeholder="0,00" value={form.receitaComercio} onChange={e => setForm(f => ({ ...f, receitaComercio: e.target.value }))}
                  className="input-aura w-full" />
              </div>
              <div>
                <label className="block text-xs text-tx-muted mb-1">Receita Serviços (R$)</label>
                <input type="number" step="0.01" placeholder="0,00" value={form.receitaServicos} onChange={e => setForm(f => ({ ...f, receitaServicos: e.target.value }))}
                  className="input-aura w-full" />
              </div>
              <div className="rounded-lg p-3 text-xs text-tx space-y-1"
                style={{ background: tint(COLORS.info, 8), border: `1px solid ${tint(COLORS.info, 25)}` }}>
                <p>INSS: R$ 75,90 (fixo)</p>
                <p>ISS: R$ 5,00 (se serviços &gt; 0)</p>
                <p>ICMS: R$ 1,00 (se comércio &gt; 0)</p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1 justify-center">Calcular</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div>
        <SectionTitle>Histórico DAS</SectionTitle>
        <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
          {loading ? <Spinner /> : apuracoes.length === 0 ? (
            <EmptyState icon={<Calculator size={32} />} title="Nenhuma apuração encontrada" />
          ) : (
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Competência</th>
                  <th className="num">Receita Total</th>
                  <th className="num">DAS Total</th>
                  <th className="num">INSS</th>
                  <th className="num">ISS</th>
                  <th className="num">ICMS</th>
                  <th className="num">Limite %</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apuracoes.map((a: any) => (
                  <tr key={a.id}>
                    <td className="text-tx-strong font-mono">{a.competencia}</td>
                    <td className="num">R$ {a.receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="num font-bold text-tx-strong">R$ {a.dasValor.toFixed(2)}</td>
                    <td className="num text-tx-muted">R$ {a.dasInss.toFixed(2)}</td>
                    <td className="num text-tx-muted">R$ {a.dasIss.toFixed(2)}</td>
                    <td className="num text-tx-muted">R$ {a.dasIcms.toFixed(2)}</td>
                    <td className="num text-tx-muted">{a.percentualUsado.toFixed(1)}%</td>
                    <td>
                      <StatusChip tone={a.status === 'pago' ? 'ok' : 'atencao'} label={a.status} size="sm" />
                    </td>
                    <td>
                      {a.status !== 'pago' && (
                        <button onClick={() => pagar({ variables: { id: a.id } })}
                          className="btn-secondary text-xs px-2 py-1">
                          Pagar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
