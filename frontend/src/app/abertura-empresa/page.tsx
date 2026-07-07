'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Building2, Plus, CheckCircle, Circle, ChevronRight } from 'lucide-react';
import { PageHeader, COLORS, tint, EmptyState, Spinner, Kpi, StatusChip, StatusTone } from '@/components/ui/kit';

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

const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone; next?: string; nextLabel?: string }> = {
  documentacao: { label: 'Documentação', tone: 'pendente', next: 'protocolo', nextLabel: 'Protocolar' },
  protocolo:    { label: 'Protocolo',    tone: 'processando', next: 'aprovacao', nextLabel: 'Em Aprovação' },
  aprovacao:    { label: 'Aprovação',    tone: 'atencao', next: 'concluida', nextLabel: 'Concluir' },
  concluida:    { label: 'Concluída',    tone: 'ok' },
  cancelada:    { label: 'Cancelada',    tone: 'critico' },
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

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa" />
      </div>
    );
  }

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
    <div className="page space-y-6">
      <PageHeader
        icon={<Building2 size={22} color={COLORS.acao} />}
        title="Abertura de Empresa"
        subtitle="Acompanhe o processo de constituição de empresas"
        action={
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Nova Abertura
          </button>
        }
      />

      {/* KPIs */}
      {resumo && (
        <div className="flex flex-wrap gap-4">
          <Kpi label="Total" value={resumo.total} />
          <Kpi label="Em Documentação" value={resumo.emDocumentacao} cor={COLORS.atencao} />
          <Kpi label="Em Protocolo" value={resumo.emProtocolo} cor={COLORS.info} />
          <Kpi label="Concluídas" value={resumo.concluidas} cor={COLORS.ok} />
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-line rounded-xl shadow-pop p-6 w-full max-w-lg my-4">
            <h2 className="text-[15px] font-semibold text-tx-strong mb-4">Nova Abertura de Empresa</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input placeholder="Nome Empresarial *" value={form.nomeEmpresarial} onChange={e => setForm(f => ({ ...f, nomeEmpresarial: e.target.value }))}
                className="input-aura w-full" required />
              <input placeholder="Nome Fantasia" value={form.nomeFantasia} onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))}
                className="input-aura w-full" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.tipoEmpresa} onChange={e => setForm(f => ({ ...f, tipoEmpresa: e.target.value }))}
                  className="input-aura">
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input placeholder="Capital Social (R$)" type="number" value={form.capitalSocial} onChange={e => setForm(f => ({ ...f, capitalSocial: e.target.value }))}
                  className="input-aura" />
              </div>
              <textarea placeholder="Objeto Social *" value={form.objetoSocial} onChange={e => setForm(f => ({ ...f, objetoSocial: e.target.value }))} rows={2}
                className="input-aura w-full resize-none" required />
              <input placeholder="CNAE Principal (ex: 6920-6/01) *" value={form.cnaePrincipal} onChange={e => setForm(f => ({ ...f, cnaePrincipal: e.target.value }))}
                className="input-aura w-full" required />
              <input placeholder="Endereço Comercial *" value={form.enderecoComercial} onChange={e => setForm(f => ({ ...f, enderecoComercial: e.target.value }))}
                className="input-aura w-full" required />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <input placeholder="Município *" value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))}
                    className="input-aura w-full" required />
                </div>
                <input placeholder="UF" maxLength={2} value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
                  className="input-aura" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 justify-center">Iniciar Processo</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? <Spinner /> : aberturas.length === 0 ? (
        <div className="card-aura">
          <EmptyState icon={<Building2 size={40} />} title="Nenhum processo de abertura iniciado" />
        </div>
      ) : (
        <div className="space-y-3">
          {aberturas.map((a: any) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.documentacao;
            const prog = progressAbertura(a);
            const isOpen = expanded === a.id;
            return (
              <div key={a.id} className="card-aura overflow-hidden p-0">
                <button onClick={() => setExpanded(isOpen ? null : a.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-inset transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusChip tone={cfg.tone} label={cfg.label} size="sm" />
                      <span className="text-xs text-tx-faint">{TIPOS[a.tipoEmpresa]}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-tx-strong m-0">{a.nomeEmpresarial}</h3>
                    {a.nomeFantasia && <p className="text-xs text-tx-muted">{a.nomeFantasia}</p>}
                    <p className="text-xs text-tx-faint mt-1">{a.municipio}/{a.uf} · Capital: R$ {parseFloat(a.capitalSocial).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-tx-muted mb-1">Progresso</p>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-inset rounded-full overflow-hidden">
                          <div className="h-full bg-acao rounded-full" style={{ width: `${prog}%` }} />
                        </div>
                        <span className="text-xs text-tx-muted num">{prog}%</span>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-tx-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-line px-5 py-4 space-y-4">
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
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${value ? '' : 'border-line hover:bg-inset'}`}
                          style={value ? { borderColor: tint(COLORS.dotOk, 45), background: tint(COLORS.dotOk, 10) } : undefined}>
                          {value ? <CheckCircle className="h-4 w-4 text-ok flex-shrink-0" /> : <Circle className="h-4 w-4 text-tx-faint flex-shrink-0" />}
                          <span className={`text-xs font-medium ${value ? 'text-ok' : 'text-tx-muted'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                    {cfg.next && (
                      <div className="flex justify-end">
                        <button onClick={() => avancar({ variables: { id: a.id, status: cfg.next } })}
                          className="btn-primary">
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
