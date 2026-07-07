'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { FileCode, Download, Plus, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, COLORS, tint, EmptyState } from '@/components/ui/kit';

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
        icon={<FileCode size={22} color={COLORS.acao} />}
        title="SPED / EFD"
        subtitle="Geração de arquivos obrigações acessórias"
      />

      {msg && (
        <div className="rounded-lg p-3 text-ok text-sm flex items-center gap-2"
          style={{ background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Mensais */}
        <div className="card-aura space-y-4">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0">Obrigações Mensais</h3>
          <div className="flex items-center gap-3">
            <label className="text-tx-muted text-sm">Competência:</label>
            <input
              type="month"
              value={refMonth}
              onChange={e => setRefMonth(e.target.value)}
              className="input-aura"
            />
          </div>
          <div className="space-y-2">
            {[
              { label: 'EFD ICMS/IPI (SPED Fiscal)', fn: () => gerarFiscal({ variables: { companyId, referenceMonth: refMonth } }) },
              { label: 'EFD PIS/COFINS (Contribuições)', fn: () => gerarEfd({ variables: { companyId, referenceMonth: refMonth } }) },
              { label: 'EFD-Reinf (Retenções)', fn: () => gerarReinf({ variables: { companyId, referenceMonth: refMonth } }) },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn} className="btn-secondary w-full">
                <Plus className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Anuais */}
        <div className="card-aura space-y-4">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0">Obrigações Anuais</h3>
          <div className="flex items-center gap-3">
            <label className="text-tx-muted text-sm">Ano-base:</label>
            <input
              type="number"
              value={anoBase}
              onChange={e => setAnoBase(Number(e.target.value))}
              min={2018}
              max={new Date().getFullYear()}
              className="input-aura w-28"
            />
          </div>
          <div className="space-y-2">
            {[
              { label: 'ECF (Escrituração Contábil Fiscal)', fn: () => gerarEcf({ variables: { companyId, anoBase } }) },
              { label: 'ECD (Escrituração Contábil Digital)', fn: () => gerarEcd({ variables: { companyId, anoBase } }) },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn} className="btn-secondary w-full">
                <Plus className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Arquivo list */}
      <div>
        <SectionTitle>Arquivos Gerados ({arquivos.length})</SectionTitle>
        <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
          <table className="table-aura">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Competência</th>
                <th className="num">Linhas</th>
                <th>Status</th>
                <th>Hash MD5</th>
                <th>Data</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {arquivos.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={<FileCode size={32} />} title="Nenhum arquivo gerado ainda." /></td></tr>
              ) : arquivos.map((arq: any) => (
                <tr key={arq.id}>
                  <td>
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-inset text-tx-muted">
                      {arq.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-tx-muted">{arq.referenceMonth}</td>
                  <td className="num text-tx-strong">{arq.linhas?.toLocaleString()}</td>
                  <td><span className="text-ok text-xs">{arq.status}</span></td>
                  <td className="text-tx-faint font-mono text-xs">{arq.fileHash?.substring(0, 16)}…</td>
                  <td className="text-tx-muted text-xs">{new Date(arq.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <button onClick={() => downloadArquivo(arq)} className="btn-ghost text-acao text-xs p-1.5">
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
