'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Users, Plus, Phone, Mail, ArrowRight } from 'lucide-react';
import { PageHeader, Kpi, Spinner, COLORS } from '@/components/ui/kit';

const GET_CRM = gql`
  query GetCrm($companyId: String!) {
    crmPipeline(companyId: $companyId) {
      pipeline { stage clientes { id nome cnpjCpf email telefone segmento stage valorEstimado probabilidade responsavel ultimoContato } total }
      total
    }
    crmMetricas(companyId: $companyId) {
      totalLeads totalClientes taxaConversao receitaMensalEstimada pipelineEstimado
    }
  }
`;

const CRIAR = gql`
  mutation CriarCrmCliente($companyId: String!, $nome: String!, $email: String, $telefone: String, $segmento: String, $origem: String, $valorEstimado: Float) {
    criarCrmCliente(companyId: $companyId, nome: $nome, email: $email, telefone: $telefone, segmento: $segmento, origem: $origem, valorEstimado: $valorEstimado) { id }
  }
`;

const AVANCAR = gql`mutation AvancarStage($id: String!, $stage: String!) { avancarStageCrm(id: $id, stage: $stage) { id stage } }`;

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  lead:        { label: 'Lead',        color: 'text-tx-muted', bg: 'bg-inset border-line-soft' },
  qualificado: { label: 'Qualificado', color: 'text-info',     bg: 'bg-inset border-line-soft' },
  proposta:    { label: 'Proposta',    color: 'text-warn',     bg: 'bg-inset border-line-soft' },
  negociacao:  { label: 'Negociação',  color: 'text-warn',     bg: 'bg-inset border-line-soft' },
  cliente:     { label: 'Cliente',     color: 'text-ok',       bg: 'bg-inset border-line-soft' },
  perdido:     { label: 'Perdido',     color: 'text-err',      bg: 'bg-inset border-line-soft' },
};

const STAGES_ORDER = ['lead', 'qualificado', 'proposta', 'negociacao', 'cliente'];

export default function CrmPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', segmento: 'servicos', origem: 'indicacao', valorEstimado: '' });

  const { data, loading, refetch } = useQuery(GET_CRM, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [criar] = useMutation(CRIAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [avancar] = useMutation(AVANCAR, { onCompleted: () => refetch() });

  if (!selectedCompany) return <div className="p-8 text-center text-tx-muted">Selecione uma empresa</div>;

  const metricas = data?.crmMetricas;
  const pipeline = data?.crmPipeline?.pipeline ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({ variables: { companyId: selectedCompany.id, ...form, valorEstimado: form.valorEstimado ? parseFloat(form.valorEstimado) : null } });
  };

  const proximoStage = (atual: string) => {
    const idx = STAGES_ORDER.indexOf(atual);
    return idx >= 0 && idx < STAGES_ORDER.length - 1 ? STAGES_ORDER[idx + 1] : null;
  };

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Users size={22} color={COLORS.acao} />}
        title="CRM — Pipeline de Clientes"
        subtitle="Gerencie leads e evolução de clientes"
        action={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo Lead
          </button>
        }
      />

      {/* KPIs */}
      {metricas && (
        <div className="flex flex-wrap gap-4">
          <Kpi label="Leads" value={metricas.totalLeads} />
          <Kpi label="Clientes" value={metricas.totalClientes} cor={COLORS.ok} />
          <Kpi label="Conversão" value={`${metricas.taxaConversao}%`} />
          <Kpi label="Receita Estimada" value={`R$ ${metricas.receitaMensalEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} />
          <Kpi label="Pipeline" value={`R$ ${metricas.pipelineEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`} />
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl shadow-pop p-6 w-full max-w-md">
            <h2 className="text-[15px] font-semibold text-tx-strong mb-4">Novo Lead / Cliente</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input placeholder="Nome / Razão Social *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className="input-aura w-full" required />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-aura w-full" />
                <input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  className="input-aura w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={form.segmento} onChange={e => setForm(f => ({ ...f, segmento: e.target.value }))}
                  className="input-aura w-full">
                  <option value="servicos">Serviços</option>
                  <option value="comercio">Comércio</option>
                  <option value="industria">Indústria</option>
                  <option value="agronegocio">Agronegócio</option>
                </select>
                <select value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="input-aura w-full">
                  <option value="indicacao">Indicação</option>
                  <option value="site">Site</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="ligacao">Ligação</option>
                </select>
              </div>
              <input placeholder="Valor mensal estimado (R$)" type="number" value={form.valorEstimado} onChange={e => setForm(f => ({ ...f, valorEstimado: e.target.value }))}
                className="input-aura w-full" />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 justify-center">Adicionar</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Pipeline */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {pipeline.map((col: any) => {
            const cfg = STAGE_CONFIG[col.stage] || STAGE_CONFIG.lead;
            return (
              <div key={col.stage} className="flex-shrink-0 w-64">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg border mb-3 ${cfg.bg}`}>
                  <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className={`text-xs ${cfg.color}`}>{col.clientes.length}</span>
                </div>
                <div className="space-y-2">
                  {col.clientes.map((c: any) => {
                    const next = proximoStage(c.stage);
                    return (
                      <div key={c.id} className="card-aura space-y-2" style={{ padding: 12 }}>
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-tx-strong leading-tight">{c.nome}</p>
                          {c.valorEstimado && (
                            <span className="num text-xs text-tx-strong font-mono ml-2 flex-shrink-0">R${c.valorEstimado}</span>
                          )}
                        </div>
                        {c.segmento && <p className="text-xs text-tx-muted">{c.segmento}</p>}
                        <div className="flex gap-2">
                          {c.email && <a href={`mailto:${c.email}`} className="text-tx-faint hover:text-acao transition-colors"><Mail className="h-3.5 w-3.5" /></a>}
                          {c.telefone && <a href={`tel:${c.telefone}`} className="text-tx-faint hover:text-ok transition-colors"><Phone className="h-3.5 w-3.5" /></a>}
                        </div>
                        {next && (
                          <button onClick={() => avancar({ variables: { id: c.id, stage: next } })}
                            className="btn-secondary w-full justify-center text-acao"
                            style={{ padding: '4px 8px', fontSize: 12 }}>
                            <ArrowRight className="h-3 w-3" /> {STAGE_CONFIG[next]?.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {col.total > 0 && (
                  <p className={`text-xs mt-2 px-1 ${cfg.color}`}>R$ {col.total.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
