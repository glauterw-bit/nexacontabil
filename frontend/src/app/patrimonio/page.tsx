'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Package, Plus, TrendingDown, CheckCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';

const LISTAR = gql`query ListarAtivos($companyId: ID!) { listarAtivos(companyId: $companyId) { id descricao categoria dataAquisicao valorAquisicao valorResidual taxaDepreciacao vidaUtilAnos localizacao ativo } }`;
const RELATORIO = gql`query RelatorioPatrimonio($companyId: ID!) { relatorioPatrimonio(companyId: $companyId) }`;
const CADASTRAR = gql`mutation CadastrarAtivo($companyId: ID!, $descricao: String!, $categoria: String!, $dataAquisicao: String!, $valorAquisicao: Float!, $vidaUtilAnos: Int, $fornecedor: String, $notaFiscal: String, $localizacao: String) { cadastrarAtivo(companyId: $companyId, descricao: $descricao, categoria: $categoria, dataAquisicao: $dataAquisicao, valorAquisicao: $valorAquisicao, vidaUtilAnos: $vidaUtilAnos, fornecedor: $fornecedor, notaFiscal: $notaFiscal, localizacao: $localizacao) { id descricao } }`;
const DEPRECIAR = gql`mutation Depreciar($companyId: ID!, $competencia: String!) { calcularDepreciacaoMensal(companyId: $companyId, competencia: $competencia) { id competencia valorDepreciacao valorLiquido } }`;

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

const CATEGORIAS = ['IMOVEL','MOVEL','VEICULO','COMPUTADOR','MAQUINA','EQUIPAMENTO','FERRAMENTA','INSTALACAO','SOFTWARE','OUTROS'];

export default function PatrimonioPage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [competencia, setCompetencia] = useState(new Date().toISOString().substring(0, 7));
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({ descricao: '', categoria: 'EQUIPAMENTO', dataAquisicao: '', valorAquisicao: '', vidaUtilAnos: '', fornecedor: '', notaFiscal: '', localizacao: '' });

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR, { variables: { companyId }, skip: !companyId });
  const { data: relData, refetch: refetchRel } = useQuery(RELATORIO, { variables: { companyId }, skip: !companyId });

  const [cadastrar] = useMutation(CADASTRAR, {
    onCompleted: () => { setMsg('Ativo cadastrado!'); setShowForm(false); setForm({ descricao: '', categoria: 'EQUIPAMENTO', dataAquisicao: '', valorAquisicao: '', vidaUtilAnos: '', fornecedor: '', notaFiscal: '', localizacao: '' }); refetch(); refetchRel(); },
    onError: e => setMsg('Erro: ' + e.message),
  });
  const [depreciar] = useMutation(DEPRECIAR, {
    onCompleted: d => { setMsg(`${d.calcularDepreciacaoMensal.length} depreciações calculadas!`); refetch(); refetchRel(); },
    onError: e => setMsg('Erro: ' + e.message),
  });

  const ativos = data?.listarAtivos ?? [];
  const rel = relData?.relatorioPatrimonio;

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa no menu lateral" />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Package size={22} color={COLORS.acao} />}
        title="Patrimônio / Imobilizado"
        subtitle="Controle e depreciação de ativos"
        action={
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo Ativo
          </button>
        }
      />

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-ok text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Summary cards */}
      {rel && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total de Ativos', value: rel.totalAtivos, format: false },
            { label: 'Valor de Aquisição', value: rel.totalAquisicao, format: true },
            { label: 'Depreciação Acum.', value: rel.totalDepreciado, format: true },
            { label: 'Valor Contábil', value: rel.totalContabil, format: true },
          ].map(({ label, value, format }) => (
            <div key={label} className="card-aura">
              <p className="text-tx-muted text-xs mb-1">{label}</p>
              <p className="num text-tx-strong font-bold text-xl">{format ? fmt(value) : value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Depreciation action */}
      <div className="card-aura flex flex-wrap items-center gap-3">
        <TrendingDown className="h-5 w-5 text-tx-muted" />
        <span className="text-tx-strong font-medium text-sm">Depreciar em:</span>
        <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
          className="input-aura" />
        <button onClick={() => depreciar({ variables: { companyId, competencia } })} className="btn-primary">
          <TrendingDown className="h-4 w-4" /> Calcular Depreciação Mensal
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card-aura space-y-4">
          <h2 className="text-[15px] font-semibold text-tx-strong m-0">Cadastrar Novo Ativo</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label: 'Descrição', key: 'descricao', type: 'text', placeholder: 'Ex: Notebook Dell Latitude' },
              { label: 'Data de Aquisição', key: 'dataAquisicao', type: 'date', placeholder: '' },
              { label: 'Valor de Aquisição (R$)', key: 'valorAquisicao', type: 'number', placeholder: '0.00' },
              { label: 'Vida Útil (anos, opcional)', key: 'vidaUtilAnos', type: 'number', placeholder: 'Auto' },
              { label: 'Fornecedor', key: 'fornecedor', type: 'text', placeholder: 'Opcional' },
              { label: 'Nota Fiscal', key: 'notaFiscal', type: 'text', placeholder: 'Nº da NF' },
              { label: 'Localização', key: 'localizacao', type: 'text', placeholder: 'Ex: Sala 3' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="text-tx-muted text-xs block mb-1">{label}</label>
                <input type={type} placeholder={placeholder} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="input-aura w-full" />
              </div>
            ))}
            <div>
              <label className="text-tx-muted text-xs block mb-1">Categoria</label>
              <div className="relative">
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="input-aura w-full appearance-none">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button
              disabled={!form.descricao || !form.dataAquisicao || !form.valorAquisicao}
              onClick={() => cadastrar({ variables: { companyId, descricao: form.descricao, categoria: form.categoria, dataAquisicao: form.dataAquisicao, valorAquisicao: Number(form.valorAquisicao), vidaUtilAnos: form.vidaUtilAnos ? Number(form.vidaUtilAnos) : undefined, fornecedor: form.fornecedor || undefined, notaFiscal: form.notaFiscal || undefined, localizacao: form.localizacao || undefined } })}
              className="btn-primary flex-1 justify-center">
              Cadastrar Ativo
            </button>
          </div>
        </div>
      )}

      {/* Asset list */}
      <div>
        <SectionTitle>Ativos Imobilizados ({ativos.length})</SectionTitle>
        <div className="card-aura overflow-x-auto">
          <table className="table-aura">
            <thead><tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Aquisição</th>
              <th className="num">Valor</th>
              <th className="num">V. Residual</th>
              <th className="text-center">Taxa Dep.</th>
              <th className="text-center">Vida Útil</th>
              <th>Local</th>
              <th className="text-center">Status</th>
            </tr></thead>
            <tbody>
              {ativos.length === 0 ? (<tr><td colSpan={9} className="text-center text-tx-muted py-8">Nenhum ativo cadastrado.</td></tr>) :
              ativos.map((a: any) => (
                <tr key={a.id}>
                  <td className="text-tx-strong font-medium">{a.descricao}</td>
                  <td><span className="text-xs bg-inset text-tx-muted px-2 py-0.5 rounded-full">{a.categoria}</span></td>
                  <td className="text-tx-muted">{fmtDate(a.dataAquisicao)}</td>
                  <td className="num text-tx-strong">{fmt(a.valorAquisicao)}</td>
                  <td className="num text-tx-muted">{fmt(a.valorResidual)}</td>
                  <td className="text-tx-muted text-center">{(Number(a.taxaDepreciacao) * 100).toFixed(0)}%/ano</td>
                  <td className="text-tx-muted text-center">{a.vidaUtilAnos} anos</td>
                  <td className="text-tx-muted text-xs">{a.localizacao || '—'}</td>
                  <td className="text-center">
                    <StatusChip size="sm" tone={a.ativo ? 'ok' : 'critico'} label={a.ativo ? 'Ativo' : 'Baixado'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
