'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Building2, Plus, CheckCircle, Circle, ChevronRight } from 'lucide-react';

const GET_ABERTURAS = gql`
  query GetAberturas($escritorioId: String!) {
    aberturas(escritorioId: $escritorioId) {
      id nomeEmpresarial nomeFantasia tipoEmpresa municipio uf status capitalSocial
      contratoSocialGerado dbeGerado cnpjEmitido cnpjNumero inscricaoEstadual inscricaoMunicipal alvara
      createdAt updatedAt
    }
    aberturasResumo(escritorioId: $escritorioId) { total emDocumentacao emProtocolo concluidas canceladas }
  }
`;

const CRIAR = gql`
  mutation CriarAbertura($escritorioId: String!, $nomeEmpresarial: String!, $tipoEmpresa: String!, $objetoSocial: String!, $cnaePrincipal: String!, $socios: String!, $enderecoComercial: String!, $municipio: String!, $uf: String!, $capitalSocial: Float, $nomeFantasia: String) {
    criarAbertura(escritorioId: $escritorioId, nomeEmpresarial: $nomeEmpresarial, tipoEmpresa: $tipoEmpresa, objetoSocial: $objetoSocial, cnaePrincipal: $cnaePrincipal, socios: $socios, enderecoComercial: $enderecoComercial, municipio: $municipio, uf: $uf, capitalSocial: $capitalSocial, nomeFantasia: $nomeFantasia) { id }
  }
`;

const AVANCAR = gql`mutation AvancarStatus($id: String!, $status: String!) { avancarStatusAbertura(id: $id, status: $status) { id status } }`;
const CHECKLIST = gql`mutation AtualizarChecklist($id: String!, $contratoSocialGerado: Boolean, $dbeGerado: Boolean, $cnpjEmitido: Boolean, $cnpjNumero: String, $alvara: Boolean) {
  atualizarChecklistAbertura(id: $id, contratoSocialGerado: $contratoSocialGerado, dbeGerado: $dbeGerado, cnpjEmitido: $cnpjEmitido, cnpjNumero: $cnpjNumero, alvara: $alvara) { id }
}`;

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  documentacao: { label: 'Documentação', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', next: 'protocolo', nextLabel: 'Protocolar' },
  protocolo:    { label: 'Protocolo',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',   next: 'aprovacao', nextLabel: 'Em Aprovação' },
  aprovacao:    { label: 'Aprovação',    color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', next: 'concluida', nextLabel: 'Concluir' },
  concluida:    { label: 'Concluída',    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  cancelada:    { label: 'Cancelada',    color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

const TIPOS: Record<string, string> = { mei: 'MEI', eireli: 'EIRELI', ltda: 'LTDA', sa: 'S/A', ss: 'S/S', outros: 'Outros' };

export default function AberturaEmpresaPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    nomeEmpresarial: '', nomeFantasia: '', tipoEmpresa: 'ltda', objetoSocial: '',
    cnaePrincipal: '', enderecoComercial: '', municipio: '', uf: 'SP', capitalSocial: '1000',
  });

  const { data, loading, refetch } = useQuery(GET_ABERTURAS, {
    variables: { escritorioId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [criar] = useMutation(CRIAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [avancar] = useMutation(AVANCAR, { onCompleted: () => refetch() });
  const [updateChecklist] = useMutation(CHECKLIST, { onCompleted: () => refetch() });

  if (!selectedCompany) return <div className="p-8 text-center text-gray-500">Selecione uma empresa</div>;

  const resumo = data?.aberturasResumo;
  const aberturas = data?.aberturas ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    criar({
      variables: {
        escritorioId: selectedCompany.id,
        ...form,
        capitalSocial: parseFloat(form.capitalSocial),
        socios: JSON.stringify([{ nome: 'Sócio Principal', cpf: '', participacao: 100 }]),
      },
    });
  };

  const progressAbertura = (a: any) => {
    const etapas = [a.contratoSocialGerado, a.dbeGerado, a.cnpjEmitido, a.inscricaoEstadual, a.inscricaoMunicipal, a.alvara];
    return Math.round((etapas.filter(Boolean).length / etapas.length) * 100);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Abertura de Empresa</h1>
          <p className="text-gray-500 text-sm mt-0.5">Acompanhe o processo de constituição de empresas</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Nova Abertura
        </button>
      </div>

      {/* KPIs */}
      {resumo && (
        <div className="flex gap-4">
          {[
            { label: 'Total', value: resumo.total, color: 'text-white' },
            { label: 'Em Documentação', value: resumo.emDocumentacao, color: 'text-yellow-400' },
            { label: 'Em Protocolo', value: resumo.emProtocolo, color: 'text-blue-400' },
            { label: 'Concluídas', value: resumo.concluidas, color: 'text-green-400' },
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-6 w-full max-w-lg my-4">
            <h2 className="text-lg font-semibold text-white mb-4">Nova Abertura de Empresa</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input placeholder="Nome Empresarial *" value={form.nomeEmpresarial} onChange={e => setForm(f => ({ ...f, nomeEmpresarial: e.target.value }))}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
              <input placeholder="Nome Fantasia" value={form.nomeFantasia} onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.tipoEmpresa} onChange={e => setForm(f => ({ ...f, tipoEmpresa: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input placeholder="Capital Social (R$)" type="number" value={form.capitalSocial} onChange={e => setForm(f => ({ ...f, capitalSocial: e.target.value }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <textarea placeholder="Objeto Social *" value={form.objetoSocial} onChange={e => setForm(f => ({ ...f, objetoSocial: e.target.value }))} rows={2}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" required />
              <input placeholder="CNAE Principal (ex: 6920-6/01) *" value={form.cnaePrincipal} onChange={e => setForm(f => ({ ...f, cnaePrincipal: e.target.value }))}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
              <input placeholder="Endereço Comercial *" value={form.enderecoComercial} onChange={e => setForm(f => ({ ...f, enderecoComercial: e.target.value }))}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input placeholder="Município *" value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))}
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
                </div>
                <input placeholder="UF" maxLength={2} value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
                  className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Iniciar Processo</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-[#1e2740] text-gray-300 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? <div className="text-center text-gray-500 py-12">Carregando...</div> : aberturas.length === 0 ? (
        <div className="text-center py-12 bg-[#161b2e] border border-[#1e2740] rounded-xl">
          <Building2 className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum processo de abertura iniciado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {aberturas.map((a: any) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.documentacao;
            const prog = progressAbertura(a);
            const isOpen = expanded === a.id;
            return (
              <div key={a.id} className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : a.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-white/2 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-gray-600">{TIPOS[a.tipoEmpresa]}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">{a.nomeEmpresarial}</h3>
                    {a.nomeFantasia && <p className="text-xs text-gray-500">{a.nomeFantasia}</p>}
                    <p className="text-xs text-gray-600 mt-1">{a.municipio}/{a.uf} · Capital: R$ {parseFloat(a.capitalSocial).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">Progresso</p>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${prog}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{prog}%</span>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[#1e2740] px-5 py-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'contratoSocialGerado', label: 'Contrato Social', value: a.contratoSocialGerado },
                        { key: 'dbeGerado', label: 'DBE/DREI', value: a.dbeGerado },
                        { key: 'cnpjEmitido', label: 'CNPJ Emitido', value: a.cnpjEmitido },
                        { key: 'inscricaoEstadual', label: 'Insc. Estadual', value: a.inscricaoEstadual },
                        { key: 'inscricaoMunicipal', label: 'Insc. Municipal', value: a.inscricaoMunicipal },
                        { key: 'alvara', label: 'Alvará', value: a.alvara },
                      ].map(({ key, label, value }) => (
                        <button key={key} onClick={() => updateChecklist({ variables: { id: a.id, [key]: !value } })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${value ? 'border-green-500/30 bg-green-500/10' : 'border-[#1e2740] hover:bg-white/3'}`}>
                          {value ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" /> : <Circle className="h-4 w-4 text-gray-600 flex-shrink-0" />}
                          <span className={`text-xs font-medium ${value ? 'text-green-400' : 'text-gray-400'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                    {cfg.next && (
                      <div className="flex justify-end">
                        <button onClick={() => avancar({ variables: { id: a.id, status: cfg.next } })}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                          {cfg.nextLabel} <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
