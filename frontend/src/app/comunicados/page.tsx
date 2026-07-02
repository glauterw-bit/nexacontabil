'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Megaphone, Plus, Send, Clock, Users, FileEdit } from 'lucide-react';

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
  geral:        { label: 'Geral',        color: 'text-info bg-blue-400/10 border-blue-400/20' },
  fiscal:       { label: 'Fiscal',       color: 'text-warn bg-yellow-400/10 border-yellow-400/20' },
  trabalhista:  { label: 'Trabalhista',  color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  urgente:      { label: 'Urgente',      color: 'text-err bg-red-400/10 border-red-400/20' },
};

const STATUS_COLOR: Record<string, string> = {
  rascunho: 'text-tx-muted bg-gray-400/10 border-gray-400/20',
  agendado: 'text-info bg-blue-400/10 border-blue-400/20',
  enviado:  'text-ok bg-green-400/10 border-green-400/20',
  cancelado: 'text-err bg-red-400/10 border-red-400/20',
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tx-strong">Comunicados</h1>
          <p className="text-tx-muted text-sm mt-0.5">Envie avisos e comunicados para todos os clientes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Novo Comunicado
        </button>
      </div>

      {/* KPIs */}
      {resumo && (
        <div className="flex gap-4">
          {[
            { label: 'Total', value: resumo.total, icon: FileEdit, color: 'text-tx-strong' },
            { label: 'Enviados', value: resumo.enviados, icon: Send, color: 'text-ok' },
            { label: 'Rascunhos', value: resumo.rascunhos, icon: FileEdit, color: 'text-tx-muted' },
            { label: 'Clientes Alcançados', value: resumo.totalAlcancados, icon: Users, color: 'text-acao' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-line rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon className={`h-5 w-5 ${color}`} />
              <div>
                <p className="text-xs text-tx-muted">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-line rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-tx-strong mb-4">Novo Comunicado</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input placeholder="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500" required />
              <textarea placeholder="Corpo do comunicado *" value={form.corpo} onChange={e => setForm(f => ({ ...f, corpo: e.target.value }))} rows={4}
                className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500 resize-none" required />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500">
                    <option value="geral">Geral</option>
                    <option value="fiscal">Fiscal</option>
                    <option value="trabalhista">Trabalhista</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Canal</label>
                  <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                    className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500">
                    <option value="portal">Portal</option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="todos">Todos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-tx-muted mb-1">Destinatários</label>
                  <select value={form.destinatarios} onChange={e => setForm(f => ({ ...f, destinatarios: e.target.value }))}
                    className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500">
                    <option value="todos">Todos os Clientes</option>
                    <option value="selecionados">Selecionados</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Salvar Rascunho</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-inset text-tx py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? <div className="text-center text-tx-muted py-8">Carregando...</div> : comunicados.length === 0 ? (
          <div className="text-center text-tx-muted py-12 bg-card border border-line rounded-xl">
            <Megaphone className="h-10 w-10 text-tx-faint mx-auto mb-3" />
            <p>Nenhum comunicado criado ainda</p>
            <p className="text-sm mt-1">Crie comunicados para informar todos os seus clientes</p>
          </div>
        ) : comunicados.map((c: any) => {
          const tipo = TIPO_CONFIG[c.tipo] || TIPO_CONFIG.geral;
          return (
            <div key={c.id} className="bg-card border border-line rounded-xl p-4">
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
                      className="flex items-center gap-1 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-acao border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors">
                      <Send className="h-3 w-3" /> Enviar
                    </button>
                    <button onClick={() => cancelar({ variables: { id: c.id } })}
                      className="text-xs bg-red-600/10 hover:bg-red-600/20 text-err border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors">
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
