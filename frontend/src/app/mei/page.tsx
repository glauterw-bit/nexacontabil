'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Calculator, CheckCircle, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';

const GET_MEI = gql`
  query GetMei($companyId: String!) {
    meiApuracoes(companyId: $companyId) {
      id competencia tipo receitaComercio receitaServicos receitaTotal
      dasValor dasInss dasIss dasIcms status dataPagamento percentualUsado
    }
    meiResumo(companyId: $companyId) {
      receitaAnual percentualUsado limiteRestante dasPago dasPendente emRisco
    }
  }
`;

const CALCULAR = gql`
  mutation CalcDasMei($companyId: String!, $competencia: String!, $receitaComercio: Float!, $receitaServicos: Float!) {
    calcularDasMei(companyId: $companyId, competencia: $competencia, receitaComercio: $receitaComercio, receitaServicos: $receitaServicos) { id }
  }
`;

const PAGAR = gql`mutation PagarDasMei($id: String!) { pagarDasMei(id: $id) { id status } }`;

export default function MeiPage() {
  const { selectedCompany } = useCompany();
  const [form, setForm] = useState({ competencia: '', receitaComercio: '', receitaServicos: '' });
  const [showForm, setShowForm] = useState(false);

  const { data, loading, refetch } = useQuery(GET_MEI, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [calcular] = useMutation(CALCULAR, { onCompleted: () => { setShowForm(false); refetch(); } });
  const [pagar] = useMutation(PAGAR, { onCompleted: () => refetch() });

  if (!selectedCompany) return <div className="p-8 text-center text-gray-500">Selecione uma empresa</div>;

  const resumo = data?.meiResumo;
  const apuracoes = data?.meiApuracoes ?? [];

  const handleCalc = (e: React.FormEvent) => {
    e.preventDefault();
    calcular({
      variables: {
        companyId: selectedCompany.id,
        competencia: form.competencia,
        receitaComercio: parseFloat(form.receitaComercio || '0'),
        receitaServicos: parseFloat(form.receitaServicos || '0'),
      },
    });
  };

  const pct = resumo ? parseFloat(resumo.percentualUsado) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">MEI — DAS / DASN-SIMEI</h1>
          <p className="text-gray-500 text-sm mt-0.5">Apuração mensal e DASN anual do Microempreendedor Individual</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Calculator className="h-4 w-4" /> Calcular DAS
        </button>
      </div>

      {/* Resumo anual */}
      {resumo && (
        <div className="grid grid-cols-3 gap-4">
          <div className={`col-span-1 bg-[#161b2e] border rounded-xl p-4 ${resumo.emRisco ? 'border-red-500/40' : 'border-[#1e2740]'}`}>
            <div className="flex items-center gap-2 mb-3">
              {resumo.emRisco ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <TrendingUp className="h-4 w-4 text-green-400" />}
              <p className="text-xs text-gray-400">Limite Anual (R$ 81.000)</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Utilizado</span>
                <span className={`font-bold ${resumo.emRisco ? 'text-red-400' : 'text-white'}`}>{resumo.percentualUsado}%</span>
              </div>
              <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <p className="text-xs text-gray-500">Restante: R$ {resumo.limiteRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle className="h-4 w-4 text-green-400" /><p className="text-xs text-gray-400">DAS Pago (ano)</p></div>
            <p className="text-2xl font-bold text-green-400">R$ {resumo.dasPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-yellow-400" /><p className="text-xs text-gray-400">DAS Pendente</p></div>
            <p className="text-2xl font-bold text-yellow-400">R$ {resumo.dasPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Calcular DAS MEI</h2>
            <form onSubmit={handleCalc} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Competência (YYYY-MM)</label>
                <input type="text" placeholder="2025-01" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Receita Comércio (R$)</label>
                <input type="number" step="0.01" placeholder="0,00" value={form.receitaComercio} onChange={e => setForm(f => ({ ...f, receitaComercio: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Receita Serviços (R$)</label>
                <input type="number" step="0.01" placeholder="0,00" value={form.receitaServicos} onChange={e => setForm(f => ({ ...f, receitaServicos: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-300 space-y-1">
                <p>INSS: R$ 75,90 (fixo)</p>
                <p>ISS: R$ 5,00 (se serviços &gt; 0)</p>
                <p>ICMS: R$ 1,00 (se comércio &gt; 0)</p>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">Calcular</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-[#1e2740] text-gray-300 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2740]"><h2 className="text-sm font-medium text-white">Histórico DAS</h2></div>
        {loading ? <div className="p-8 text-center text-gray-500">Carregando...</div> : apuracoes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nenhuma apuração encontrada</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-[#1e2740]">
                {['Competência', 'Receita Total', 'DAS Total', 'INSS', 'ISS', 'ICMS', 'Limite %', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {apuracoes.map((a: any) => (
                <tr key={a.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-mono">{a.competencia}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">R$ {a.receitaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm font-bold text-white">R$ {a.dasValor.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">R$ {a.dasInss.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">R$ {a.dasIss.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">R$ {a.dasIcms.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{a.percentualUsado.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full border font-medium ${a.status === 'pago' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.status !== 'pago' && (
                      <button onClick={() => pagar({ variables: { id: a.id } })}
                        className="text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/20 px-2 py-1 rounded transition-colors">
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
