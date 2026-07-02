'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Package, Plus, TrendingDown, CheckCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Selecione uma empresa no menu lateral</p>
          <Link href="/carteira" className="mt-4 inline-block text-indigo-400 hover:underline">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Patrimônio / Imobilizado</h1>
            <p className="text-gray-400 text-sm">Controle e depreciação de ativos</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="h-4 w-4" /> Novo Ativo
        </button>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
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
            <div key={label} className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">{label}</p>
              <p className="text-white font-bold text-xl">{format ? fmt(value) : value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Depreciation action */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 flex flex-wrap items-center gap-3">
        <TrendingDown className="h-5 w-5 text-orange-400" />
        <span className="text-white font-medium">Depreciar em:</span>
        <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
          className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
        <button onClick={() => depreciar({ variables: { companyId, competencia } })}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <TrendingDown className="h-4 w-4" /> Calcular Depreciação Mensal
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-[#161b2e] border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Cadastrar Novo Ativo</h2>
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
                <label className="text-gray-400 text-sm block mb-1">{label}</label>
                <input type={type} placeholder={placeholder} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            ))}
            <div>
              <label className="text-gray-400 text-sm block mb-1">Categoria</label>
              <div className="relative">
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-[#1e2740] text-gray-400 hover:text-white rounded-lg text-sm transition-colors">Cancelar</button>
            <button
              disabled={!form.descricao || !form.dataAquisicao || !form.valorAquisicao}
              onClick={() => cadastrar({ variables: { companyId, descricao: form.descricao, categoria: form.categoria, dataAquisicao: form.dataAquisicao, valorAquisicao: Number(form.valorAquisicao), vidaUtilAnos: form.vidaUtilAnos ? Number(form.vidaUtilAnos) : undefined, fornecedor: form.fornecedor || undefined, notaFiscal: form.notaFiscal || undefined, localizacao: form.localizacao || undefined } })}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm transition-colors">
              Cadastrar Ativo
            </button>
          </div>
        </div>
      )}

      {/* Asset list */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1e2740]"><h2 className="text-white font-semibold">Ativos Imobilizados ({ativos.length})</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1e2740] text-gray-400">
              <th className="px-4 py-3 text-left">Descrição</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-left">Aquisição</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">V. Residual</th>
              <th className="px-4 py-3 text-center">Taxa Dep.</th>
              <th className="px-4 py-3 text-center">Vida Útil</th>
              <th className="px-4 py-3 text-left">Local</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr></thead>
            <tbody>
              {ativos.length === 0 ? (<tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nenhum ativo cadastrado.</td></tr>) :
              ativos.map((a: any) => (
                <tr key={a.id} className="border-b border-[#1e2740] hover:bg-white/5">
                  <td className="px-4 py-3 text-white font-medium">{a.descricao}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">{a.categoria}</span></td>
                  <td className="px-4 py-3 text-gray-400">{fmtDate(a.dataAquisicao)}</td>
                  <td className="px-4 py-3 text-white text-right font-mono">{fmt(a.valorAquisicao)}</td>
                  <td className="px-4 py-3 text-gray-400 text-right font-mono">{fmt(a.valorResidual)}</td>
                  <td className="px-4 py-3 text-orange-400 text-center">{(Number(a.taxaDepreciacao) * 100).toFixed(0)}%/ano</td>
                  <td className="px-4 py-3 text-gray-400 text-center">{a.vidaUtilAnos} anos</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.localizacao || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.ativo ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {a.ativo ? 'Ativo' : 'Baixado'}
                    </span>
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
