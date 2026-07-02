'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { UserCheck, Calculator, FileText, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const GET_EMPLOYEES = gql`query GetEmployees($companyId: ID!) { employees(companyId: $companyId) { id name role baseSalary } }`;
const LISTAR_FERIAS = gql`query ListarFerias($companyId: ID!) { listarFerias(companyId: $companyId) { id employee { name } periodoAquisitivo dtInicioGozo diasUsufruidos valorTotal inssFerias irrfFerias valorLiquido status } }`;
const LISTAR_RESCISOES = gql`query ListarRescisoes($companyId: ID!) { listarRescisoes(companyId: $companyId) { id employee { name } dataDemissao tipoRescisao totalBruto inssRescisao irrfRescisao totalLiquido multa40Fgts status } }`;
const DECIMO = gql`query Decimo($companyId: ID!, $ano: Int!) { calcularDecimoTerceiro(companyId: $companyId, ano: $ano) { employeeNome avosAquisitivos totalBruto primeiraParcela inss irrf totalLiquido } }`;
const CALC_FERIAS = gql`mutation CalcFerias($employeeId: ID!, $periodoAquisitivo: String!, $dtInicioGozo: String!, $dtFimGozo: String!, $diasGozo: Int) { calcularFerias(employeeId: $employeeId, periodoAquisitivo: $periodoAquisitivo, dtInicioGozo: $dtInicioGozo, dtFimGozo: $dtFimGozo, diasGozo: $diasGozo) { id valorTotal valorLiquido } }`;
const CALC_RESCISAO = gql`mutation CalcRescisao($employeeId: ID!, $dataDemissao: String!, $tipoRescisao: String!, $avisoPrevioTrabalhado: Boolean) { calcularRescisao(employeeId: $employeeId, dataDemissao: $dataDemissao, tipoRescisao: $tipoRescisao, avisoPrevioTrabalhado: $avisoPrevioTrabalhado) { id totalLiquido totalBruto multa40Fgts direitos } }`;

const fmt = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Tab = 'ferias' | 'rescisao' | 'decimo';

export default function FeriasRescisaoPage() {
  const { selectedCompany } = useCompany();
  const [tab, setTab] = useState<Tab>('ferias');
  const [empId, setEmpId] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());

  // Férias form
  const [periodoAquis, setPeriodoAquis] = useState('');
  const [dtInicio, setDtInicio] = useState('');
  const [dtFim, setDtFim] = useState('');
  const [diasGozo, setDiasGozo] = useState(30);

  // Rescisão form
  const [dtDemissao, setDtDemissao] = useState('');
  const [tipoRescisao, setTipoRescisao] = useState('sem_justa_causa');
  const [avisoPrev, setAvisoPrev] = useState(true);

  const [result, setResult] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const companyId = selectedCompany?.id ?? '';
  const { data: empData } = useQuery(GET_EMPLOYEES, { variables: { companyId }, skip: !companyId });
  const { data: feriasData, refetch: refetchFerias } = useQuery(LISTAR_FERIAS, { variables: { companyId }, skip: !companyId });
  const { data: rescData, refetch: refetchResc } = useQuery(LISTAR_RESCISOES, { variables: { companyId }, skip: !companyId });
  const { data: decimoData, refetch: refetchDecimo } = useQuery(DECIMO, { variables: { companyId, ano }, skip: !companyId || tab !== 'decimo' });

  const [calcFerias] = useMutation(CALC_FERIAS, {
    onCompleted: d => { setResult(d.calcularFerias); setMsg('Férias calculadas!'); refetchFerias(); },
    onError: e => setMsg('Erro: ' + e.message),
  });
  const [calcRescisao] = useMutation(CALC_RESCISAO, {
    onCompleted: d => { setResult(d.calcularRescisao); setMsg('Rescisão calculada!'); refetchResc(); },
    onError: e => setMsg('Erro: ' + e.message),
  });

  const employees = empData?.employees ?? [];

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
        <UserCheck className="h-7 w-7 text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Férias, 13º e Rescisão</h1>
          <p className="text-gray-400 text-sm">Cálculos trabalhistas com INSS e IRRF</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0f1117] p-1 rounded-xl w-fit">
        {(['ferias', 'rescisao', 'decimo'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setResult(null); setMsg(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t === 'ferias' ? 'Férias' : t === 'rescisao' ? 'Rescisão' : '13º Salário'}
          </button>
        ))}
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Form */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5 text-indigo-400" />
            {tab === 'ferias' ? 'Calcular Férias' : tab === 'rescisao' ? 'Calcular Rescisão' : '13º Salário'}
          </h2>

          <div>
            <label className="text-gray-400 text-sm block mb-1">Funcionário</label>
            <div className="relative">
              <select
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500"
              >
                <option value="">Selecionar...</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {tab === 'ferias' && (
            <>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Período Aquisitivo</label>
                <input value={periodoAquis} onChange={e => setPeriodoAquis(e.target.value)} placeholder="Ex: 2024-01 a 2025-01"
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Início Gozo</label>
                  <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)}
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Fim Gozo</label>
                  <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Dias de Gozo: {diasGozo}</label>
                <input type="range" min={10} max={30} value={diasGozo} onChange={e => setDiasGozo(Number(e.target.value))}
                  className="w-full accent-indigo-600" />
              </div>
              <button
                disabled={!empId || !periodoAquis || !dtInicio || !dtFim}
                onClick={() => calcFerias({ variables: { employeeId: empId, periodoAquisitivo: periodoAquis, dtInicioGozo: dtInicio, dtFimGozo: dtFim, diasGozo } })}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm transition-colors"
              >
                Calcular Férias
              </button>
            </>
          )}

          {tab === 'rescisao' && (
            <>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Data de Demissão</label>
                <input type="date" value={dtDemissao} onChange={e => setDtDemissao(e.target.value)}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Tipo de Rescisão</label>
                <div className="relative">
                  <select value={tipoRescisao} onChange={e => setTipoRescisao(e.target.value)}
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:border-indigo-500">
                    <option value="sem_justa_causa">Sem Justa Causa</option>
                    <option value="com_justa_causa">Com Justa Causa</option>
                    <option value="pedido_demissao">Pedido de Demissão</option>
                    <option value="rescisao_indireta">Rescisão Indireta</option>
                    <option value="acordo">Acordo (§ 484-A)</option>
                    <option value="culpa_reciproca">Culpa Recíproca</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-gray-400 text-sm cursor-pointer">
                <input type="checkbox" checked={avisoPrev} onChange={e => setAvisoPrev(e.target.checked)} className="rounded accent-indigo-600" />
                Aviso prévio trabalhado
              </label>
              <button
                disabled={!empId || !dtDemissao}
                onClick={() => calcRescisao({ variables: { employeeId: empId, dataDemissao: dtDemissao, tipoRescisao, avisoPrevioTrabalhado: avisoPrev } })}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm transition-colors"
              >
                Calcular Rescisão
              </button>
            </>
          )}

          {tab === 'decimo' && (
            <>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Ano</label>
                <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} min={2020} max={2030}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <button onClick={() => refetchDecimo()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm transition-colors">
                Calcular 13º Salário
              </button>
            </>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="bg-[#161b2e] border border-green-500/30 rounded-xl p-5 space-y-3">
            <h2 className="text-white font-semibold">Resultado do Cálculo</h2>
            {tab === 'ferias' && (
              <div className="space-y-2">
                <Row label="Total Bruto" value={fmt(result.valorTotal)} />
                <Row label="INSS" value={fmt(result.inssFerias)} red />
                <Row label="IRRF" value={fmt(result.irrfFerias)} red />
                <div className="border-t border-[#1e2740] pt-2">
                  <Row label="LÍQUIDO" value={fmt(result.valorLiquido)} big />
                </div>
              </div>
            )}
            {tab === 'rescisao' && (
              <div className="space-y-2">
                <Row label="Total Bruto" value={fmt(result.totalBruto)} />
                <Row label="INSS" value={fmt(result.inssRescisao)} red />
                <Row label="IRRF" value={fmt(result.irrfRescisao)} red />
                <Row label="Multa 40% FGTS" value={fmt(result.multa40Fgts)} />
                <div className="border-t border-[#1e2740] pt-2">
                  <Row label="LÍQUIDO" value={fmt(result.totalLiquido)} big />
                </div>
                {result.direitos?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-gray-400 text-xs mb-2">Direitos:</p>
                    <ul className="space-y-1">
                      {result.direitos.map((d: string, i: number) => (
                        <li key={i} className="text-xs text-gray-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 13º Table */}
      {tab === 'decimo' && decimoData?.calcularDecimoTerceiro && (
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#1e2740]">
            <h2 className="text-white font-semibold">13º Salário {ano} — Todos os Funcionários</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2740] text-gray-400">
                <th className="px-4 py-3 text-left">Funcionário</th>
                <th className="px-4 py-3 text-center">Avos</th>
                <th className="px-4 py-3 text-right">Bruto</th>
                <th className="px-4 py-3 text-right">1ª Parcela</th>
                <th className="px-4 py-3 text-right">INSS</th>
                <th className="px-4 py-3 text-right">IRRF</th>
                <th className="px-4 py-3 text-right">2ª Parcela</th>
                <th className="px-4 py-3 text-right">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {decimoData.calcularDecimoTerceiro.map((d: any) => (
                <tr key={d.employeeId || d.employeeNome} className="border-b border-[#1e2740] hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{d.employeeNome}</td>
                  <td className="px-4 py-3 text-gray-400 text-center">{d.avosAquisitivos}/12</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{fmt(d.totalBruto)}</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{fmt(d.primeiraParcela)}</td>
                  <td className="px-4 py-3 text-red-400 text-right">{fmt(d.inss)}</td>
                  <td className="px-4 py-3 text-red-400 text-right">{fmt(d.irrf)}</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{fmt(d.segundaParcela)}</td>
                  <td className="px-4 py-3 text-green-400 font-bold text-right">{fmt(d.totalLiquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History tables */}
      {tab === 'ferias' && (
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#1e2740]"><h2 className="text-white font-semibold flex items-center gap-2"><FileText className="h-5 w-5" /> Histórico de Férias</h2></div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1e2740] text-gray-400"><th className="px-4 py-3 text-left">Funcionário</th><th className="px-4 py-3 text-left">Período</th><th className="px-4 py-3 text-left">Início</th><th className="px-4 py-3 text-center">Dias</th><th className="px-4 py-3 text-right">Líquido</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
            <tbody>
              {(feriasData?.listarFerias ?? []).length === 0 ? (<tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nenhum cálculo de férias.</td></tr>) :
              (feriasData?.listarFerias ?? []).map((f: any) => (
                <tr key={f.id} className="border-b border-[#1e2740] hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{f.employee?.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{f.periodoAquisitivo}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(f.dtInicioGozo).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-gray-400 text-center">{f.diasUsufruidos}</td>
                  <td className="px-4 py-3 text-green-400 font-bold text-right">{fmt(f.valorLiquido)}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded-full">{f.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rescisao' && (
        <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#1e2740]"><h2 className="text-white font-semibold">Histórico de Rescisões</h2></div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[#1e2740] text-gray-400"><th className="px-4 py-3 text-left">Funcionário</th><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-left">Data</th><th className="px-4 py-3 text-right">Bruto</th><th className="px-4 py-3 text-right">Multa</th><th className="px-4 py-3 text-right">Líquido</th></tr></thead>
            <tbody>
              {(rescData?.listarRescisoes ?? []).length === 0 ? (<tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nenhuma rescisão calculada.</td></tr>) :
              (rescData?.listarRescisoes ?? []).map((r: any) => (
                <tr key={r.id} className="border-b border-[#1e2740] hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{r.employee?.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.tipoRescisao.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.dataDemissao).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{fmt(r.totalBruto)}</td>
                  <td className="px-4 py-3 text-orange-400 text-right">{fmt(r.multa40Fgts)}</td>
                  <td className="px-4 py-3 text-green-400 font-bold text-right">{fmt(r.totalLiquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, red, big }: { label: string; value: string; red?: boolean; big?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${big ? 'text-white font-bold' : 'text-gray-400'}`}>{label}</span>
      <span className={`font-mono ${big ? 'text-green-400 font-bold text-lg' : red ? 'text-red-400' : 'text-white'}`}>{value}</span>
    </div>
  );
}
