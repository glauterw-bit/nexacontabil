'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Users, Plus, Phone, Mail, ArrowRight, TrendingUp, Target, DollarSign } from 'lucide-react';

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
  lead:        { label: 'Lead',       color: 'text-tx-muted',   bg: 'bg-gray-500/10 border-gray-500/20' },
  qualificado: { label: 'Qualificado', color: 'text-info',  bg: 'bg-blue-500/10 border-blue-500/20' },
  proposta:    { label: 'Proposta',   color: 'text-warn', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  negociacao:  { label: 'Negociação', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  cliente:     { label: 'Cliente',    color: 'text-ok',  bg: 'bg-green-500/10 border-green-500/20' },
  perdido:     { label: 'Perdido',    color: 'text-err',    bg: 'bg-red-500/10 border-red-500/20' },
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tx-strong">CRM — Pipeline de Clientes</h1>
          <p className="text-tx-muted text-sm mt-0.5">Gerencie leads e evolução de clientes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Novo Lead
        </button>
      </div>

      {/* KPIs */}
      {metricas && (
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Leads', value: metricas.totalLeads, icon: Users, color: 'text-info' },
            { label: 'Clientes', value: metricas.totalClientes, icon: Target, color: 'text-ok' },
            { label: 'Conversão', value: `${metricas.taxaConversao}%`, icon: TrendingUp, color: 'text-acao' },
            { label: 'Receita Estimada', value: `R$ ${metricas.receitaMensalEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-warn' },
            { label: 'Pipeline', value: `R$ ${metricas.pipelineEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, icon: ArrowRight, color: 'text-orange-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="text-tx-muted text-xs">{label}</p>
              </div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-tx-strong mb-4">Novo Lead / Cliente</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input placeholder="Nome / Razão Social *" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500" required />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500" />
                <input placeholder="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={form.segmento} onChange={e => setForm(f => ({ ...f, segmento: e.target.value }))}
                  className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500">
                  <option value="servicos">Serviços</option>
                  <option value="comercio">Comércio</option>
                  <option value="industria">Indústria</option>
                  <option value="agronegocio">Agronegócio</option>
                </select>
                <select value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500">
                  <option value="indicacao">Indicação</option>
                  <option value="site">Site</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="ligacao">Ligação</option>
                </select>
              </div>
              <input placeholder="Valor mensal estimado (R$)" type="number" value={form.valorEstimado} onChange={e => setForm(f => ({ ...f, valorEstimado: e.target.value }))}
                className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500" />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Adicionar</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-inset text-tx py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Pipeline */}
      {loading ? (
        <div className="text-center text-tx-muted py-12">Carregando pipeline...</div>
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
                      <div key={c.id} className="bg-card border border-line rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-tx-strong leading-tight">{c.nome}</p>
                          {c.valorEstimado && (
                            <span className="text-xs text-ok font-mono ml-2 flex-shrink-0">R${c.valorEstimado}</span>
                          )}
                        </div>
                        {c.segmento && <p className="text-xs text-tx-muted">{c.segmento}</p>}
                        <div className="flex gap-2">
                          {c.email && <a href={`mailto:${c.email}`} className="text-tx-faint hover:text-acao transition-colors"><Mail className="h-3.5 w-3.5" /></a>}
                          {c.telefone && <a href={`tel:${c.telefone}`} className="text-tx-faint hover:text-ok transition-colors"><Phone className="h-3.5 w-3.5" /></a>}
                        </div>
                        {next && (
                          <button onClick={() => avancar({ variables: { id: c.id, stage: next } })}
                            className="w-full flex items-center justify-center gap-1 text-xs text-acao hover:text-tx-strong bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded py-1 transition-colors">
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
