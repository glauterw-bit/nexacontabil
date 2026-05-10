'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { CheckSquare, Plus, AlertTriangle, Clock, Flag } from 'lucide-react';

const GET_TAREFAS = gql`
  query GetTarefas($companyId: String!) {
    tarefasKanban(companyId: $companyId) {
      status label
      tarefas { id titulo descricao tipo status prioridade responsavel prazo concluidaEm }
    }
    tarefasResumo(companyId: $companyId) { total backlog emAndamento concluidas atrasadas }
  }
`;

const CRIAR = gql`
  mutation CriarTarefa($companyId: String!, $titulo: String!, $descricao: String, $tipo: String, $prioridade: String, $responsavel: String, $prazo: String) {
    criarTarefa(companyId: $companyId, titulo: $titulo, descricao: $descricao, tipo: $tipo, prioridade: $prioridade, responsavel: $responsavel, prazo: $prazo) { id }
  }
`;

const MOVER = gql`mutation MoverTarefa($id: String!, $status: String!) { moverTarefa(id: $id, status: $status) { id status } }`;

const PRIORIDADE_CONFIG: Record<string, { color: string; label: string }> = {
  baixa:   { color: 'text-gray-400',   label: 'Baixa' },
  media:   { color: 'text-blue-400',   label: 'Média' },
  alta:    { color: 'text-yellow-400', label: 'Alta' },
  urgente: { color: 'text-red-400',    label: 'Urgente' },
};

const COL_CONFIG: Record<string, string> = {
  backlog: 'border-gray-500/30 bg-gray-500/5',
  a_fazer: 'border-blue-500/30 bg-blue-500/5',
  em_andamento: 'border-yellow-500/30 bg-yellow-500/5',
  revisao: 'border-orange-500/30 bg-orange-500/5',
  concluida: 'border-green-500/30 bg-green-500/5',
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog', a_fazer: 'A Fazer', em_andamento: 'Em Andamento', revisao: 'Revisão', concluida: 'Concluída',
};

const STATUS_ORDER = ['backlog', 'a_fazer', 'em_andamento', 'revisao', 'concluida'];

export default function TarefasPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', tipo: 'geral', prioridade: 'media', responsavel: '', prazo: '' });

  const { data, loading, refetch } = useQuery(GET_TAREFAS, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [criar] = useMutation(CRIAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [mover] = useMutation(MOVER, { onCompleted: () => refetch() });

  if (!selectedCompany) return <div className="p-8 text-center text-gray-500">Selecione uma empresa</div>;

  const resumo = data?.tarefasResumo;
  const colunas: any[] = data?.tarefasKanban ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({ variables: { companyId: selectedCompany.id, ...form, prazo: form.prazo || undefined } });
  };

  const proximoStatus = (atual: string) => {
    const idx = STATUS_ORDER.indexOf(atual);
    return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
  };

  const isAtrasada = (t: any) => t.prazo && !['concluida', 'cancelada'].includes(t.status) && new Date(t.prazo) < new Date();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tarefas — Kanban</h1>
          <p className="text-gray-500 text-sm mt-0.5">Organize o fluxo de trabalho da sua equipe</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Nova Tarefa
        </button>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="flex gap-4">
          {[
            { label: 'Total', value: resumo.total, color: 'text-white' },
            { label: 'Em andamento', value: resumo.emAndamento, color: 'text-yellow-400' },
            { label: 'Concluídas', value: resumo.concluidas, color: 'text-green-400' },
            { label: 'Atrasadas', value: resumo.atrasadas, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#161b2e] border border-[#1e2740] rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Nova Tarefa</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input placeholder="Título *" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
              <textarea placeholder="Descrição" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option value="geral">Geral</option>
                  <option value="obrigacao">Obrigação</option>
                  <option value="documento">Documento</option>
                  <option value="cobranca">Cobrança</option>
                  <option value="reuniao">Reunião</option>
                </select>
                <select value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Responsável" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                <input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Criar</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-[#1e2740] text-gray-300 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Carregando...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {colunas.map((col: any) => (
            <div key={col.status} className="flex-shrink-0 w-60">
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg border mb-3 ${COL_CONFIG[col.status] || ''}`}>
                <span className="text-xs font-semibold text-white">{col.label}</span>
                <span className="text-xs text-gray-500">{col.tarefas.length}</span>
              </div>
              <div className="space-y-2">
                {col.tarefas.map((t: any) => {
                  const pr = PRIORIDADE_CONFIG[t.prioridade] || PRIORIDADE_CONFIG.media;
                  const next = proximoStatus(t.status);
                  const atrasada = isAtrasada(t);
                  return (
                    <div key={t.id} className={`bg-[#161b2e] border rounded-lg p-3 space-y-2 ${atrasada ? 'border-red-500/30' : 'border-[#1e2740]'}`}>
                      <div className="flex items-start gap-2">
                        <Flag className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${pr.color}`} />
                        <p className="text-sm text-white leading-tight">{t.titulo}</p>
                      </div>
                      {t.descricao && <p className="text-xs text-gray-500 truncate">{t.descricao}</p>}
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        {t.responsavel && <span>{t.responsavel}</span>}
                        {t.prazo && (
                          <span className={`flex items-center gap-1 ${atrasada ? 'text-red-400' : ''}`}>
                            {atrasada && <AlertTriangle className="h-3 w-3" />}
                            <Clock className="h-3 w-3" />
                            {new Date(t.prazo).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      {next && t.status !== 'concluida' && (
                        <button onClick={() => mover({ variables: { id: t.id, status: next } })}
                          className="w-full text-xs text-indigo-400 hover:text-white bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 rounded py-1 transition-colors">
                          → {STATUS_LABELS[next]}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
