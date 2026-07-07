'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DollarSign, Plus } from 'lucide-react';
import { PageHeader, Kpi, StatusChip, Spinner, EmptyState, SectionTitle, COLORS, StatusTone } from '@/components/ui/kit';

const GET_HONORARIOS = gql`
  query GetHonorarios($companyId: String!) {
    honorarios(companyId: $companyId) {
      id descricao competencia valor vencimento status formaPagamento paidAt
    }
    honorariosResumo(companyId: $companyId) {
      totalPendente totalPago totalAtrasado vencendoHoje quantidade
    }
  }
`;

const CRIAR = gql`
  mutation CriarHonorario($companyId: String!, $descricao: String!, $competencia: String!, $valor: Float!, $vencimento: String!, $formaPagamento: String) {
    criarHonorario(companyId: $companyId, descricao: $descricao, competencia: $competencia, valor: $valor, vencimento: $vencimento, formaPagamento: $formaPagamento) { id }
  }
`;

const PAGAR = gql`mutation PagarHonorario($id: String!) { pagarHonorario(id: $id) { id status } }`;
const CANCELAR = gql`mutation CancelarHonorario($id: String!) { cancelarHonorario(id: $id) { id status } }`;
const GERAR = gql`mutation GerarMensalidade($companyId: String!, $competencia: String!, $valor: Float!) { gerarMensalidade(companyId: $companyId, competencia: $competencia, valor: $valor) { id } }`;

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone }> = {
  pendente:  { label: 'Pendente',  tone: 'atencao' },
  pago:      { label: 'Pago',      tone: 'ok' },
  atrasado:  { label: 'Atrasado',  tone: 'critico' },
  cancelado: { label: 'Cancelado', tone: 'pendente' },
};

export default function HonorariosPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ descricao: 'Honorários contábeis', competencia: '', valor: '', vencimento: '', formaPagamento: 'boleto' });

  const { data, loading, refetch } = useQuery(GET_HONORARIOS, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [criar] = useMutation(CRIAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [pagar] = useMutation(PAGAR, { onCompleted: () => refetch() });
  const [cancelar] = useMutation(CANCELAR, { onCompleted: () => refetch() });

  if (!selectedCompany) return (
    <div className="page">
      <EmptyState icon={<DollarSign size={40} />} title="Selecione uma empresa" sub="Escolha uma empresa no menu lateral para ver os honorários." />
    </div>
  );

  const resumo = data?.honorariosResumo;
  const honorarios = data?.honorarios ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({ variables: { companyId: selectedCompany.id, ...form, valor: parseFloat(form.valor) } });
  };

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<DollarSign size={22} color={COLORS.acao} />}
        title="Honorários"
        subtitle="Gestão de honorários contábeis do cliente"
        action={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo Honorário
          </button>
        }
      />

      {/* KPIs */}
      {resumo && (
        <div className="flex gap-3 flex-wrap">
          <Kpi label="Pendente" value={`R$ ${resumo.totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} cor={COLORS.atencao} />
          <Kpi label="Pago (total)" value={`R$ ${resumo.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} cor={COLORS.ok} />
          <Kpi label="Atrasado" value={`R$ ${resumo.totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} cor={COLORS.erro} />
          <Kpi label="Vencendo Hoje" value={resumo.vencendoHoje} cor={COLORS.acao} />
        </div>
      )}

      {/* Modal de criação */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl shadow-pop p-6 w-full max-w-md">
            <h2 className="text-[15px] font-semibold text-tx-strong mb-4">Novo Honorário</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: 'descricao', label: 'Descrição', type: 'text' },
                { key: 'competencia', label: 'Competência (YYYY-MM)', type: 'text', placeholder: '2025-01' },
                { key: 'valor', label: 'Valor (R$)', type: 'number' },
                { key: 'vencimento', label: 'Vencimento', type: 'date' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-tx-muted mb-1">{label}</label>
                  <input
                    type={type} placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="input-aura w-full"
                    required
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-tx-muted mb-1">Forma de Pagamento</label>
                <select value={form.formaPagamento} onChange={e => setForm(f => ({ ...f, formaPagamento: e.target.value }))}
                  className="input-aura w-full">
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 justify-center">Criar</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div>
        <SectionTitle>Histórico de Honorários</SectionTitle>
        <div className="card-aura !p-0 overflow-hidden">
          {loading ? (
            <Spinner />
          ) : honorarios.length === 0 ? (
            <EmptyState icon={<DollarSign size={40} />} title="Nenhum honorário cadastrado" />
          ) : (
            <table className="table-aura">
              <thead>
                <tr>
                  {['Descrição', 'Competência', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                    <th key={h} className={h === 'Valor' ? 'num' : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {honorarios.map((h: any) => {
                  const cfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.pendente;
                  return (
                    <tr key={h.id}>
                      <td className="text-tx-strong">{h.descricao}</td>
                      <td className="text-tx-muted">{h.competencia}</td>
                      <td className="num text-tx-strong font-medium">R$ {h.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="text-tx-muted">{new Date(h.vencimento).toLocaleDateString('pt-BR')}</td>
                      <td>
                        <StatusChip tone={cfg.tone} label={cfg.label} size="sm" />
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {h.status === 'pendente' && (
                            <button onClick={() => pagar({ variables: { id: h.id } })}
                              className="btn-secondary text-xs px-2.5 py-1">
                              Pagar
                            </button>
                          )}
                          {['pendente', 'atrasado'].includes(h.status) && (
                            <button onClick={() => cancelar({ variables: { id: h.id } })}
                              className="btn-ghost text-xs px-2.5 py-1 text-err">
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
