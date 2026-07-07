'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { UserCheck, Calculator, FileText, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';

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
        icon={<UserCheck size={22} color={COLORS.acao} />}
        title="Férias, 13º e Rescisão"
        subtitle="Cálculos trabalhistas com INSS e IRRF"
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-inset p-1 rounded-xl w-fit">
        {(['ferias', 'rescisao', 'decimo'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setResult(null); setMsg(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-acao text-white' : 'text-tx-muted hover:text-tx-strong'}`}>
            {t === 'ferias' ? 'Férias' : t === 'rescisao' ? 'Rescisão' : '13º Salário'}
          </button>
        ))}
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-ok text-sm flex items-center gap-2">
          {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {/* Form */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-aura space-y-4">
          <h2 className="text-[15px] font-semibold text-tx-strong flex items-center gap-2 m-0">
            <Calculator className="h-4 w-4 text-tx-muted" />
            {tab === 'ferias' ? 'Calcular Férias' : tab === 'rescisao' ? 'Calcular Rescisão' : '13º Salário'}
          </h2>

          <div>
            <label className="text-tx-muted text-sm block mb-1">Funcionário</label>
            <div className="relative">
              <select
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                className="input-aura w-full appearance-none"
              >
                <option value="">Selecionar...</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted pointer-events-none" />
            </div>
          </div>

          {tab === 'ferias' && (
            <>
              <div>
                <label className="text-tx-muted text-sm block mb-1">Período Aquisitivo</label>
                <input value={periodoAquis} onChange={e => setPeriodoAquis(e.target.value)} placeholder="Ex: 2024-01 a 2025-01"
                  className="input-aura w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-tx-muted text-sm block mb-1">Início Gozo</label>
                  <input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)}
                    className="input-aura w-full" />
                </div>
                <div>
                  <label className="text-tx-muted text-sm block mb-1">Fim Gozo</label>
                  <input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)}
                    className="input-aura w-full" />
                </div>
              </div>
              <div>
                <label className="text-tx-muted text-sm block mb-1">Dias de Gozo: {diasGozo}</label>
                <input type="range" min={10} max={30} value={diasGozo} onChange={e => setDiasGozo(Number(e.target.value))}
                  className="w-full accent-acao" />
              </div>
              <button
                disabled={!empId || !periodoAquis || !dtInicio || !dtFim}
                onClick={() => calcFerias({ variables: { employeeId: empId, periodoAquisitivo: periodoAquis, dtInicioGozo: dtInicio, dtFimGozo: dtFim, diasGozo } })}
                className="btn-primary w-full justify-center"
              >
                Calcular Férias
              </button>
            </>
          )}

          {tab === 'rescisao' && (
            <>
              <div>
                <label className="text-tx-muted text-sm block mb-1">Data de Demissão</label>
                <input type="date" value={dtDemissao} onChange={e => setDtDemissao(e.target.value)}
                  className="input-aura w-full" />
              </div>
              <div>
                <label className="text-tx-muted text-sm block mb-1">Tipo de Rescisão</label>
                <div className="relative">
                  <select value={tipoRescisao} onChange={e => setTipoRescisao(e.target.value)}
                    className="input-aura w-full appearance-none">
                    <option value="sem_justa_causa">Sem Justa Causa</option>
                    <option value="com_justa_causa">Com Justa Causa</option>
                    <option value="pedido_demissao">Pedido de Demissão</option>
                    <option value="rescisao_indireta">Rescisão Indireta</option>
                    <option value="acordo">Acordo (§ 484-A)</option>
                    <option value="culpa_reciproca">Culpa Recíproca</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-muted pointer-events-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-tx-muted text-sm cursor-pointer">
                <input type="checkbox" checked={avisoPrev} onChange={e => setAvisoPrev(e.target.checked)} className="rounded accent-acao" />
                Aviso prévio trabalhado
              </label>
              <button
                disabled={!empId || !dtDemissao}
                onClick={() => calcRescisao({ variables: { employeeId: empId, dataDemissao: dtDemissao, tipoRescisao, avisoPrevioTrabalhado: avisoPrev } })}
                className="btn-primary w-full justify-center"
              >
                Calcular Rescisão
              </button>
            </>
          )}

          {tab === 'decimo' && (
            <>
              <div>
                <label className="text-tx-muted text-sm block mb-1">Ano</label>
                <input type="number" value={ano} onChange={e => setAno(Number(e.target.value))} min={2020} max={2030}
                  className="input-aura w-full" />
              </div>
              <button onClick={() => refetchDecimo()} className="btn-primary w-full justify-center">
                Calcular 13º Salário
              </button>
            </>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="card-aura space-y-3">
            <h2 className="text-[15px] font-semibold text-tx-strong m-0">Resultado do Cálculo</h2>
            {tab === 'ferias' && (
              <div className="space-y-2">
                <Row label="Total Bruto" value={fmt(result.valorTotal)} />
                <Row label="INSS" value={fmt(result.inssFerias)} red />
                <Row label="IRRF" value={fmt(result.irrfFerias)} red />
                <div className="border-t border-line pt-2">
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
                <div className="border-t border-line pt-2">
                  <Row label="LÍQUIDO" value={fmt(result.totalLiquido)} big />
                </div>
                {result.direitos?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-tx-muted text-xs mb-2">Direitos:</p>
                    <ul className="space-y-1">
                      {result.direitos.map((d: string, i: number) => (
                        <li key={i} className="text-xs text-tx flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-ok rounded-full" /> {d}
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
        <div>
          <SectionTitle>13º Salário {ano} — Todos os Funcionários</SectionTitle>
          <div className="card-aura overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th className="text-center">Avos</th>
                  <th className="num">Bruto</th>
                  <th className="num">1ª Parcela</th>
                  <th className="num">INSS</th>
                  <th className="num">IRRF</th>
                  <th className="num">2ª Parcela</th>
                  <th className="num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {decimoData.calcularDecimoTerceiro.map((d: any) => (
                  <tr key={d.employeeId || d.employeeNome}>
                    <td className="text-tx-strong">{d.employeeNome}</td>
                    <td className="text-tx-muted text-center">{d.avosAquisitivos}/12</td>
                    <td className="num">{fmt(d.totalBruto)}</td>
                    <td className="num">{fmt(d.primeiraParcela)}</td>
                    <td className="num">{fmt(d.inss)}</td>
                    <td className="num">{fmt(d.irrf)}</td>
                    <td className="num">{fmt(d.segundaParcela)}</td>
                    <td className="num text-tx-strong font-semibold">{fmt(d.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History tables */}
      {tab === 'ferias' && (
        <div>
          <SectionTitle><FileText className="h-4 w-4 text-tx-muted" /> Histórico de Férias</SectionTitle>
          <div className="card-aura overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Período</th>
                  <th>Início</th>
                  <th className="text-center">Dias</th>
                  <th className="num">Líquido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(feriasData?.listarFerias ?? []).length === 0 ? (<tr><td colSpan={6} className="text-center text-tx-muted py-8">Nenhum cálculo de férias.</td></tr>) :
                (feriasData?.listarFerias ?? []).map((f: any) => (
                  <tr key={f.id}>
                    <td className="text-tx-strong">{f.employee?.name}</td>
                    <td className="text-tx-muted text-xs">{f.periodoAquisitivo}</td>
                    <td className="text-tx-muted">{new Date(f.dtInicioGozo).toLocaleDateString('pt-BR')}</td>
                    <td className="text-tx-muted text-center">{f.diasUsufruidos}</td>
                    <td className="num text-tx-strong font-semibold">{fmt(f.valorLiquido)}</td>
                    <td><StatusChip size="sm" tone="processando" label={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'rescisao' && (
        <div>
          <SectionTitle>Histórico de Rescisões</SectionTitle>
          <div className="card-aura overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th className="num">Bruto</th>
                  <th className="num">Multa</th>
                  <th className="num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {(rescData?.listarRescisoes ?? []).length === 0 ? (<tr><td colSpan={6} className="text-center text-tx-muted py-8">Nenhuma rescisão calculada.</td></tr>) :
                (rescData?.listarRescisoes ?? []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="text-tx-strong">{r.employee?.name}</td>
                    <td className="text-tx-muted text-xs">{r.tipoRescisao.replace(/_/g, ' ')}</td>
                    <td className="text-tx-muted">{new Date(r.dataDemissao).toLocaleDateString('pt-BR')}</td>
                    <td className="num">{fmt(r.totalBruto)}</td>
                    <td className="num">{fmt(r.multa40Fgts)}</td>
                    <td className="num text-tx-strong font-semibold">{fmt(r.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, red, big }: { label: string; value: string; red?: boolean; big?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${big ? 'text-tx-strong font-bold' : 'text-tx-muted'}`}>{label}</span>
      <span className={`num ${big ? 'text-ok font-bold text-lg' : red ? 'text-err' : 'text-tx-strong'}`}>{value}</span>
    </div>
  );
}
