'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Megaphone, Plus, Send, Clock, Users } from 'lucide-react';
import { PageHeader, Kpi, Spinner, EmptyState, COLORS } from '@/components/ui/kit';

const GET_COMUNICADOS = gql`
  query GetComunicados($escritorioId: String!) {
    comunicados(escritorioId: $escritorioId) {
      id titulo corpo tipo canal destinatarios status enviadoEm lidos totalEnviados createdAt
    }
    comunicadosResumo(escritorioId: $escritorioId) {
      total enviados rascunhos agendados totalAlcancados
    }
  }
`;

const CRIAR = gql`
  mutation CriarComunicado($escritorioId: String!, $titulo: String!, $corpo: String!, $tipo: String, $canal: String, $destinatarios: String) {
    criarComunicado(escritorioId: $escritorioId, titulo: $titulo, corpo: $corpo, tipo: $tipo, canal: $canal, destinatarios: $destinatarios) { id }
  }
`;

const ENVIAR = gql`mutation EnviarComunicado($id: String!) { enviarComunicado(id: $id) { id status totalEnviados } }`;
const CANCELAR = gql`mutation CancelarComunicado($id: String!) { cancelarComunicado(id: $id) { id status } }`;

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  geral:        { label: 'Geral',        color: 'text-info bg-inset border-line-soft' },
  fiscal:       { label: 'Fiscal',       color: 'text-warn bg-inset border-line-soft' },
  trabalhista:  { label: 'Trabalhista',  color: 'text-warn bg-inset border-line-soft' },
  urgente:      { label: 'Urgente',      color: 'text-err bg-inset border-line-soft' },
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: 'text-tx-muted bg-inset border-line-soft',
  agendado: 'text-info bg-inset border-line-soft',
  enviado:  'text-ok bg-inset border-line-soft',
  cancelado: 'text-err bg-inset border-line-soft',
};

export default function ComunicadosPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', corpo: '', tipo: 'geral', canal: 'portal', destinatarios: 'todos' });

  const { data, loading, refetch } = useQuery(GET_COMUNICADOS, {
    variables: { escritorioId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [criar] = useMutation(CRIAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [enviar] = useMutation(ENVIAR, { onCompleted: () => refetch() });
  const [cancelar] = useMutation(CANCELAR, { onCompleted: () => refetch() });

  if (!selectedCompany) return <div className="p-8 text-center text-tx-muted">Selecione uma empresa</div>;

  const resumo = data?.comunicadosResumo;
  const comunicados = data?.comunicados ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({ variables: { escritorioId: selectedCompany.id, ...form } });
  };

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Megaphone size={22} color={COLORS.acao} />}
        title="Comunicados"
        subtitle="Envie avisos e comunicados para todos os clientes"
        action={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo Comunicado
          </button>
        }
      />

      {/* KPIs */}
      {resumo && (
        <div className="flex flex-wrap gap-4">
          <Kpi label="Total" value={resumo.total} />
          <Kpi label="Enviados" value={resumo.enviados} cor={COLORS.ok} />
          <Kpi label="Rascunhos" value={resumo.rascunhos} cor={COLORS.muted} />
          <Kpi label="Clientes Alcançados" value={resumo.totalAlcancados} />
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl shadow-pop p-6 w-full max-w-lg">
            <h2 className="text-[15px] font-semibold text-tx-strong mb-4">Novo Comunicado</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input placeholder="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="input-aura w-full" required />
              <textarea placeholder="Corpo do comunicado *" value={form.corpo} onChange={e => setForm(f => ({ ...f, corpo: e.target.value }))} rows={4}
                className="input-aura w-full resize-none" required />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="input-aura w-full">
                    <option value="geral">Geral</option>
                    <option value="fiscal">Fiscal</option>
                    <option value="trabalhista">Trabalhista</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Canal</label>
                  <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                    className="input-aura w-full">
                    <option value="portal">Portal</option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="todos">Todos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Destinatários</label>
                  <select value={form.destinatarios} onChange={e => setForm(f => ({ ...f, destinatarios: e.target.value }))}
                    className="input-aura w-full">
                    <option value="todos">Todos os Clientes</option>
                    <option value="selecionados">Selecionados</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 justify-center">Salvar Rascunho</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? <Spinner /> : comunicados.length === 0 ? (
          <div className="card-aura">
            <EmptyState icon={<Megaphone size={34} />} title="Nenhum comunicado criado ainda"
              sub="Crie comunicados para informar todos os seus clientes" />
          </div>
        ) : comunicados.map((c: any) => {
          const tipo = TIPO_CONFIG[c.tipo] || TIPO_CONFIG.geral;
          return (
            <div key={c.id} className="card-aura" style={{ padding: 16 }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tipo.color}`}>{tipo.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[c.status] || ''}`}>{c.status}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-tx-strong">{c.titulo}</h3>
                  <p className="text-xs text-tx-muted mt-1 line-clamp-2">{c.corpo}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-tx-faint">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                    {c.totalEnviados > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.totalEnviados} enviados · {c.lidos} lidos</span>}
                    <span>Canal: {c.canal}</span>
                  </div>
                </div>
                {c.status === 'rascunho' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => enviar({ variables: { id: c.id } })}
                      className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                    <button onClick={() => cancelar({ variables: { id: c.id } })}
                      className="btn-secondary text-err" style={{ padding: '6px 12px', fontSize: 12 }}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
