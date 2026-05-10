'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Award, Calculator, TrendingDown, CheckCircle, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const LISTAR = gql`
  query ListarApuracoes($companyId: ID!) {
    listarApuracoesSimples(companyId: $companyId) {
      id competencia anexo rbt12 receitaMes aliquotaEfetiva valorDas status codigoBarras
    }
  }
`;
const CALCULAR = gql`
  mutation Calcular($companyId: ID!, $competencia: String!) {
    calcularPGDAS(companyId: $companyId, referenceMonth: $competencia) {
      id competencia anexo rbt12 receitaMes aliquotaEfetiva valorDas status
      aliquotaEfetivaPercent fatorRPercent partilhaDetalhada
    }
  }
`;
const GERAR_DAS = gql`
  mutation GerarDAS($id: ID!) {
    gerarDASSimples(apuracaoId: $id) { id status codigoBarras }
  }
`;
const SIMULAR = gql`
  query Simular($companyId: ID!, $referenceMonth: String!) {
    simularRegimesTributarios(companyId: $companyId, referenceMonth: $referenceMonth) {
      rbr12 receitaMensal melhorRegime economiaMensal
      simplesNacional { aliquota tributacaoMensal tributacaoAnual }
      lucroPresumido { aliquotaEfetiva tributacaoMensal tributacaoAnual }
      lucroReal { aliquotaEfetiva tributacaoMensal tributacaoAnual }
    }
  }
`;

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function SimplesNacionalPage() {
  const { selectedCompany } = useCompany();
  const [competencia, setCompetencia] = useState(new Date().toISOString().substring(0, 7));
  const [msg, setMsg] = useState('');
  const [showSim, setShowSim] = useState(false);

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR, { variables: { companyId }, skip: !companyId });
  const { data: simData, refetch: runSim } = useQuery(SIMULAR, {
    variables: { companyId, referenceMonth: competencia },
    skip: !companyId || !showSim,
  });

  const [calcular, { data: calcData }] = useMutation(CALCULAR, {
    onCompleted: () => { setMsg('PGDAS calculado!'); refetch(); },
    onError: e => setMsg('Erro: ' + e.message),
  });
  const [gerarDas] = useMutation(GERAR_DAS, {
    onCompleted: () => { setMsg('DAS gerado!'); refetch(); },
  });

  const apuracoes = data?.listarApuracoesSimples ?? [];
  const ultimaCalc = calcData?.calcularPGDAS;
  const sim = simData?.simularRegimesTributarios;

  if (!selectedCompany) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Selecione uma empresa no menu lateral</p>
          <Link href="/companies" className="mt-4 inline-block text-indigo-400 hover:underline">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center gap-3">
        <Award className="h-7 w-7 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Simples Nacional</h1>
          <p className="text-gray-400 text-sm">PGDAS-D e apuração mensal</p>
        </div>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Actions */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">Competência:</label>
            <input
              type="month"
              value={competencia}
              onChange={e => setCompetencia(e.target.value)}
              className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => calcular({ variables: { companyId, competencia } })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Calculator className="h-4 w-4" /> Calcular PGDAS
          </button>
          <button
            onClick={() => { setShowSim(true); runSim(); }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <TrendingDown className="h-4 w-4" /> Simular Regimes
          </button>
        </div>
      </div>

      {/* Resultado do cálculo */}
      {ultimaCalc && (
        <div className="bg-[#161b2e] border border-indigo-500/30 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Apuração {ultimaCalc.competencia} — Anexo {ultimaCalc.anexo}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">RBT 12 meses</p>
              <p className="text-white font-bold text-lg">{fmt(ultimaCalc.rbt12)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Receita do Mês</p>
              <p className="text-white font-bold text-lg">{fmt(ultimaCalc.receitaMes)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">Alíquota Efetiva</p>
              <p className="text-yellow-400 font-bold text-lg">{ultimaCalc.aliquotaEfetivaPercent}%</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-xs mb-1">DAS a Recolher</p>
              <p className="text-green-400 font-bold text-lg">{fmt(ultimaCalc.valorDas)}</p>
            </div>
          </div>
          {ultimaCalc.partilhaDetalhada && (
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {Object.entries(ultimaCalc.partilhaDetalhada).map(([k, v]: any) => (
                <div key={k} className="bg-[#0f1117] rounded-lg p-2 text-center">
                  <p className="text-gray-500 text-xs uppercase">{k}</p>
                  <p className="text-white text-xs font-mono mt-1">{fmt(v)}</p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => gerarDas({ variables: { id: ultimaCalc.id } })}
            className="mt-4 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <BarChart3 className="h-4 w-4" /> Gerar DAS
          </button>
        </div>
      )}

      {/* Simulação de regimes */}
      {sim && (
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Simulação de Regimes — Melhor: <span className="text-green-400">{sim.melhorRegime}</span></h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Simples Nacional', data: sim.simplesNacional, aliqKey: 'aliquota', color: 'border-blue-500/30' },
              { label: 'Lucro Presumido', data: sim.lucroPresumido, aliqKey: 'aliquotaEfetiva', color: 'border-purple-500/30' },
              { label: 'Lucro Real', data: sim.lucroReal, aliqKey: 'aliquotaEfetiva', color: 'border-orange-500/30' },
            ].map(({ label, data: d, aliqKey, color }) => (
              <div key={label} className={`bg-[#0f1117] border rounded-xl p-4 ${label === sim.melhorRegime ? 'border-green-500/50' : color}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-medium text-sm">{label}</h3>
                  {label === sim.melhorRegime && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Melhor</span>}
                </div>
                <p className="text-2xl font-bold text-white">{(d as any)[aliqKey]}%</p>
                <p className="text-gray-400 text-xs mt-1">Alíquota efetiva</p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Mensal</span>
                    <span className="text-white">{fmt(d.tributacaoMensal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Anual</span>
                    <span className="text-white">{fmt(d.tributacaoAnual)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-400 text-sm mt-3">
            Economia máxima: <span className="text-green-400 font-bold">{fmt(Number(sim.economiaMensal))}/mês</span>
          </p>
        </div>
      )}

      {/* History */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[#1e2740]">
          <h2 className="text-white font-semibold">Histórico de Apurações</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1e2740] text-gray-400">
              <th className="px-4 py-3 text-left">Competência</th>
              <th className="px-4 py-3 text-left">Anexo</th>
              <th className="px-4 py-3 text-right">RBT12</th>
              <th className="px-4 py-3 text-right">Receita Mês</th>
              <th className="px-4 py-3 text-right">Alíquota</th>
              <th className="px-4 py-3 text-right">DAS</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {apuracoes.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Nenhuma apuração realizada.</td></tr>
            ) : apuracoes.map((ap: any) => (
              <tr key={ap.id} className="border-b border-[#1e2740] hover:bg-white/5">
                <td className="px-4 py-3 text-white font-mono">{ap.competencia}</td>
                <td className="px-4 py-3 text-gray-400">Anexo {ap.anexo}</td>
                <td className="px-4 py-3 text-gray-400 text-right">{fmt(ap.rbt12)}</td>
                <td className="px-4 py-3 text-gray-400 text-right">{fmt(ap.receitaMes)}</td>
                <td className="px-4 py-3 text-yellow-400 text-right font-mono">{(Number(ap.aliquotaEfetiva) * 100).toFixed(2)}%</td>
                <td className="px-4 py-3 text-green-400 text-right font-bold">{fmt(ap.valorDas)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${ap.status === 'pago' ? 'bg-green-500/10 text-green-400' : ap.status === 'pgdas_gerado' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {ap.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {ap.status === 'calculado' && (
                    <button onClick={() => gerarDas({ variables: { id: ap.id } })} className="text-xs text-indigo-400 hover:underline">Gerar DAS</button>
                  )}
                  {ap.codigoBarras && (
                    <span className="text-xs text-gray-600 font-mono block">{ap.codigoBarras.substring(0, 20)}…</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
