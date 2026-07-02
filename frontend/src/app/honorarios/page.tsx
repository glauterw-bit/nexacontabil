'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { DollarSign, Plus, CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pendente:  { label: 'Pendente',  color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
  pago:      { label: 'Pago',      color: 'text-green-400 bg-green-400/10 border-green-400/20',   icon: CheckCircle },
  atrasado:  { label: 'Atrasado',  color: 'text-red-400 bg-red-400/10 border-red-400/20',         icon: AlertTriangle },
  cancelado: { label: 'Cancelado', color: 'text-gray-500 bg-gray-500/10 border-gray-500/20',      icon: XCircle },
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
    <div className="p-8 text-center text-gray-500">Selecione uma empresa no menu lateral</div>
  );

  const resumo = data?.honorariosResumo;
  const honorarios = data?.honorarios ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({ variables: { companyId: selectedCompany.id, ...form, valor: parseFloat(form.valor) } });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Honorários</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestão de honorários contábeis do cliente</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Novo Honorário
        </button>
      </div>

      {/* KPIs */}
      {resumo && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Pendente', value: `R$ ${resumo.totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-yellow-400', icon: Clock },
            { label: 'Pago (total)', value: `R$ ${resumo.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-green-400', icon: CheckCircle },
            { label: 'Atrasado', value: `R$ ${resumo.totalAtrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-red-400', icon: AlertTriangle },
            { label: 'Vencendo Hoje', value: resumo.vencendoHoje, color: 'text-indigo-400', icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="text-gray-400 text-xs">{label}</p>
              </div>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal de criação */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Novo Honorário</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: 'descricao', label: 'Descrição', type: 'text' },
                { key: 'competencia', label: 'Competência (YYYY-MM)', type: 'text', placeholder: '2025-01' },
                { key: 'valor', label: 'Valor (R$)', type: 'number' },
                { key: 'vencimento', label: 'Vencimento', type: 'date' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type={type} placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Forma de Pagamento</label>
                <select value={form.formaPagamento} onChange={e => setForm(f => ({ ...f, formaPagamento: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Criar</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-[#1e2740] hover:bg-[#253050] text-gray-300 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2740]">
          <h2 className="text-sm font-medium text-white">Histórico de Honorários</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : honorarios.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhum honorário cadastrado</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-[#1e2740]">
                {['Descrição', 'Competência', 'Valor', 'Vencimento', 'Status', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {honorarios.map((h: any) => {
                const cfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.pendente;
                const Icon = cfg.icon;
                return (
                  <tr key={h.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{h.descricao}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{h.competencia}</td>
                    <td className="px-4 py-3 text-sm text-white font-medium">R$ {h.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{new Date(h.vencimento).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 w-fit text-xs px-2 py-1 rounded-full border font-medium ${cfg.color}`}>
                        <Icon className="h-3 w-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {h.status === 'pendente' && (
                          <button onClick={() => pagar({ variables: { id: h.id } })}
                            className="text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/20 px-2 py-1 rounded transition-colors">
                            Pagar
                          </button>
                        )}
                        {['pendente', 'atrasado'].includes(h.status) && (
                          <button onClick={() => cancelar({ variables: { id: h.id } })}
                            className="text-xs bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 px-2 py-1 rounded transition-colors">
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
  );
}
