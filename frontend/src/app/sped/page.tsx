'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { FileCode, Download, Plus, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const LISTAR_SPED = gql`
  query ListarArquivosSped($companyId: ID!) {
    listarArquivosSped(companyId: $companyId) {
      id tipo referenceMonth status linhas fileHash createdAt
    }
  }
`;

const GERAR_FISCAL = gql`mutation GerarSpedFiscal($companyId: ID!, $referenceMonth: String!) { gerarSpedFiscal(companyId: $companyId, referenceMonth: $referenceMonth) { id tipo status linhas } }`;
const GERAR_EFD = gql`mutation GerarEfdContrib($companyId: ID!, $referenceMonth: String!) { gerarEfdContribuicoes(companyId: $companyId, referenceMonth: $referenceMonth) { id tipo status linhas } }`;
const GERAR_ECF = gql`mutation GerarEcf($companyId: ID!, $anoBase: Int!) { gerarEcf(companyId: $companyId, anoBase: $anoBase) { id tipo status linhas } }`;
const GERAR_ECD = gql`mutation GerarEcd($companyId: ID!, $anoBase: Int!) { gerarEcd(companyId: $companyId, anoBase: $anoBase) { id tipo status linhas } }`;
const GERAR_REINF = gql`mutation GerarEfdReinf($companyId: ID!, $referenceMonth: String!) { gerarEfdReinf(companyId: $companyId, referenceMonth: $referenceMonth) { id tipo status linhas } }`;
const BAIXAR = gql`query BaixarSped($id: ID!) { baixarArquivoSped(id: $id) { fileContent tipo referenceMonth } }`;

const TIPO_COLORS: Record<string, string> = {
  EFD_ICMS_IPI: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  EFD_PIS_COFINS: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ECF: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ECD: 'bg-green-500/10 text-green-400 border-green-500/20',
  EFD_REINF: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

export default function SpedPage() {
  const { selectedCompany } = useCompany();
  const [refMonth, setRefMonth] = useState(new Date().toISOString().substring(0, 7));
  const [anoBase, setAnoBase] = useState(new Date().getFullYear() - 1);
  const [msg, setMsg] = useState('');

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR_SPED, { variables: { companyId }, skip: !companyId });

  const opts = {
    onCompleted: (d: any) => {
      const k = Object.keys(d)[0];
      setMsg(`${d[k].tipo} gerado com ${d[k].linhas} linhas!`);
      refetch();
    },
    onError: (e: any) => setMsg('Erro: ' + e.message),
  };

  const [gerarFiscal] = useMutation(GERAR_FISCAL, opts);
  const [gerarEfd] = useMutation(GERAR_EFD, opts);
  const [gerarEcf] = useMutation(GERAR_ECF, opts);
  const [gerarEcd] = useMutation(GERAR_ECD, opts);
  const [gerarReinf] = useMutation(GERAR_REINF, opts);

  const arquivos = data?.listarArquivosSped ?? [];

  const downloadArquivo = (arq: any) => {
    if (!arq.fileContent) return;
    const blob = new Blob([arq.fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPED_${arq.tipo}_${arq.referenceMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      <div className="flex items-center gap-3">
        <FileCode className="h-7 w-7 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">SPED / EFD</h1>
          <p className="text-gray-400 text-sm">Geração de arquivos obrigações acessórias</p>
        </div>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Mensais */}
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Obrigações Mensais</h2>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm">Competência:</label>
            <input
              type="month"
              value={refMonth}
              onChange={e => setRefMonth(e.target.value)}
              className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-2">
            {[
              { label: 'EFD ICMS/IPI (SPED Fiscal)', fn: () => gerarFiscal({ variables: { companyId, referenceMonth: refMonth } }), color: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'EFD PIS/COFINS (Contribuições)', fn: () => gerarEfd({ variables: { companyId, referenceMonth: refMonth } }), color: 'bg-purple-600 hover:bg-purple-700' },
              { label: 'EFD-Reinf (Retenções)', fn: () => gerarReinf({ variables: { companyId, referenceMonth: refMonth } }), color: 'bg-pink-600 hover:bg-pink-700' },
            ].map(({ label, fn, color }) => (
              <button key={label} onClick={fn} className={`w-full flex items-center gap-2 ${color} text-white px-4 py-2.5 rounded-lg text-sm transition-colors`}>
                <Plus className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Anuais */}
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Obrigações Anuais</h2>
          <div className="flex items-center gap-3">
            <label className="text-gray-400 text-sm">Ano-base:</label>
            <input
              type="number"
              value={anoBase}
              onChange={e => setAnoBase(Number(e.target.value))}
              min={2018}
              max={new Date().getFullYear()}
              className="w-28 bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="space-y-2">
            {[
              { label: 'ECF (Escrituração Contábil Fiscal)', fn: () => gerarEcf({ variables: { companyId, anoBase } }), color: 'bg-orange-600 hover:bg-orange-700' },
              { label: 'ECD (Escrituração Contábil Digital)', fn: () => gerarEcd({ variables: { companyId, anoBase } }), color: 'bg-green-600 hover:bg-green-700' },
            ].map(({ label, fn, color }) => (
              <button key={label} onClick={fn} className={`w-full flex items-center gap-2 ${color} text-white px-4 py-2.5 rounded-lg text-sm transition-colors`}>
                <Plus className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Arquivo list */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1e2740]">
          <h2 className="text-white font-semibold">Arquivos Gerados ({arquivos.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2740] text-gray-400">
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Competência</th>
                <th className="px-4 py-3 text-left">Linhas</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Hash MD5</th>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {arquivos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nenhum arquivo gerado ainda.</td></tr>
              ) : arquivos.map((arq: any) => (
                <tr key={arq.id} className="border-b border-[#1e2740] hover:bg-white/5">
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${TIPO_COLORS[arq.tipo] || 'text-gray-400 bg-gray-400/10 border-gray-400/20'}`}>
                      {arq.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{arq.referenceMonth}</td>
                  <td className="px-4 py-3 text-white font-mono">{arq.linhas?.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="text-green-400 text-xs">{arq.status}</span></td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{arq.fileHash?.substring(0, 16)}…</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(arq.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => downloadArquivo(arq)} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
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
