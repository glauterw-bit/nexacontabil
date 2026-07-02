'use client';
import { useState, Fragment } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronDown, ChevronUp, Download, CheckCircle, Brain, AlertTriangle,
  ArrowLeft, Loader2, Calculator, Building2,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { useQuery, useMutation, gql } from '@apollo/client';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const PAYSLIPS_QUERY = gql`
  query Payslips($companyId: String!, $referenceMonth: String) {
    payslips(companyId: $companyId, referenceMonth: $referenceMonth) {
      id employeeId referenceMonth baseSalary overtimeHours overtimeValue
      bonuses otherDeductions inssEmployee inssEmployer irrf fgts
      grossSalary netSalary status paymentDate
      employee { id name role department cpf }
    }
  }
`;

const EMPLOYEES_QUERY = gql`
  query Employees($companyId: String!) {
    employees(companyId: $companyId) {
      id name role baseSalary active
    }
  }
`;

const CALCULATE_PAYSLIP = gql`
  mutation CalculatePayslip($input: CalculatePayslipInput!) {
    calculatePayslip(input: $input) {
      id employeeId referenceMonth grossSalary netSalary status
    }
  }
`;

const APPROVE_PAYSLIP = gql`
  mutation ApprovePayslip($id: ID!, $userId: String!) {
    approvePayslip(id: $id, userId: $userId) { id status }
  }
`;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function FolhaDetalhesMesPage() {
  const { month } = useParams<{ month: string }>();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  const refMonth = (() => {
    if (!month) return new Date().toISOString().slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) return month;
    return new Date().toISOString().slice(0, 7);
  })();
  const [y, m] = refMonth.split('-');
  const titulo = `${MESES[parseInt(m, 10) - 1] || ''} ${y}`;

  const { data, loading, refetch } = useQuery(PAYSLIPS_QUERY, {
    variables: { companyId: selectedCompany?.id ?? '', referenceMonth: refMonth },
    skip: !selectedCompany,
    fetchPolicy: 'cache-and-network',
  });

  const { data: empData } = useQuery(EMPLOYEES_QUERY, {
    variables: { companyId: selectedCompany?.id ?? '' },
    skip: !selectedCompany,
  });

  const [calculatePayslip, { loading: calculating }] = useMutation(CALCULATE_PAYSLIP, {
    onCompleted: () => { toast.push('Folha calculada', { variant: 'success' }); refetch(); },
    onError: (e) => toast.push(e.message, { variant: 'error' }),
  });

  const [approvePayslip] = useMutation(APPROVE_PAYSLIP, {
    onCompleted: () => { toast.push('Holerite aprovado', { variant: 'success' }); refetch(); },
    onError: (e) => toast.push(e.message, { variant: 'error' }),
  });

  const payslips = data?.payslips ?? [];
  const allEmployees = empData?.employees ?? [];

  const calculateAllMissing = async () => {
    if (!selectedCompany) return;
    const existing = new Set(payslips.map((p: any) => p.employeeId));
    const missing = allEmployees.filter((e: any) => e.active && !existing.has(e.id));
    if (missing.length === 0) {
      toast.push('Todos os colaboradores já têm holerite neste mês', { variant: 'info' });
      return;
    }
    toast.push(`Calculando ${missing.length} holerites…`, { variant: 'info' });
    for (const emp of missing) {
      await calculatePayslip({
        variables: {
          input: { employeeId: emp.id, companyId: selectedCompany.id, referenceMonth: refMonth },
        },
      });
    }
  };

  const aprovarTodos = async () => {
    if (!user) return;
    const pending = payslips.filter((p: any) => p.status !== 'approved' && p.status !== 'paid');
    for (const p of pending) {
      await approvePayslip({ variables: { id: p.id, userId: user.id } });
    }
  };

  const totalBruto = payslips.reduce((s: number, p: any) => s + Number(p.grossSalary || 0), 0);
  const totalInss = payslips.reduce((s: number, p: any) => s + Number(p.inssEmployee || 0), 0);
  const totalIrrf = payslips.reduce((s: number, p: any) => s + Number(p.irrf || 0), 0);
  const totalFgts = payslips.reduce((s: number, p: any) => s + Number(p.fgts || 0), 0);
  const totalLiquido = payslips.reduce((s: number, p: any) => s + Number(p.netSalary || 0), 0);
  const totalInssEmpresa = payslips.reduce((s: number, p: any) => s + Number(p.inssEmployer || 0), 0);

  const anomalias: { tipo: string; msg: string }[] = [];
  payslips.forEach((p: any) => {
    if (p.overtimeHours > 10) anomalias.push({ tipo: 'warning', msg: `${p.employee?.name} tem ${p.overtimeHours}h extras — acima do limite legal de 10h. Verifique a CLT.` });
    if (p.otherDeductions > p.grossSalary * 0.3) anomalias.push({ tipo: 'warning', msg: `${p.employee?.name} tem descontos > 30% do bruto. Revisar.` });
  });
  if (payslips.length > 0 && anomalias.length === 0) {
    anomalias.push({ tipo: 'ok', msg: 'INSS e IRRF calculados pela tabela progressiva 2026. Sem anomalias detectadas.' });
  }

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/folha" className="btn-ghost p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Folha de Pagamento — {titulo}</h1>
            <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · {payslips.length} holerites</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={calculateAllMissing} disabled={calculating} className="btn-ghost text-sm border border-[#1e2740] inline-flex items-center gap-1.5">
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calcular faltantes
          </button>
          <button className="btn-ghost text-sm border border-[#1e2740]">
            <Download className="h-4 w-4" /> PDF
          </button>
          <button onClick={aprovarTodos} className="btn-primary text-sm">
            <CheckCircle className="h-4 w-4" /> Aprovar Todos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Bruto', value: totalBruto, color: 'text-white' },
          { label: 'INSS', value: totalInss, color: 'text-orange-400' },
          { label: 'IRRF', value: totalIrrf, color: 'text-red-400' },
          { label: 'FGTS', value: totalFgts, color: 'text-purple-400' },
          { label: 'Líquido', value: totalLiquido, color: 'text-green-400' },
        ].map(t => (
          <div key={t.label} className="card-aura text-center">
            <p className="text-xs text-gray-500 mb-1">{t.label}</p>
            <p className={`text-lg font-bold ${t.color}`}>{Number(t.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
        ))}
      </div>

      <div className="card-aura overflow-x-auto">
        {loading && payslips.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando holerites…
          </div>
        ) : payslips.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm mb-3">Nenhum holerite calculado para {titulo}.</p>
            <button onClick={calculateAllMissing} disabled={calculating || allEmployees.length === 0} className="btn-primary inline-flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Calcular folha do mês
            </button>
            {allEmployees.length === 0 && (
              <p className="text-xs text-gray-600 mt-3">
                Nenhum colaborador cadastrado. <Link href="/folha/colaboradores" className="text-indigo-400 hover:underline">Cadastrar →</Link>
              </p>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                <th className="pb-3 font-medium">Funcionário</th>
                <th className="pb-3 font-medium text-right">Bruto</th>
                <th className="pb-3 font-medium text-right">INSS</th>
                <th className="pb-3 font-medium text-right">IRRF</th>
                <th className="pb-3 font-medium text-right">FGTS</th>
                <th className="pb-3 font-medium text-right">H.Ex.</th>
                <th className="pb-3 font-medium text-right">Líquido</th>
                <th className="pb-3 font-medium text-center">Status</th>
                <th className="pb-3 font-medium text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2740]">
              {payslips.map((p: any) => (
                <Fragment key={p.id}>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="py-3">
                      <p className="text-white text-sm font-medium">{p.employee?.name ?? p.employeeId}</p>
                      <p className="text-gray-500 text-xs">{p.employee?.role}</p>
                    </td>
                    <td className="py-3 text-sm text-right font-mono text-white">{Number(p.grossSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="py-3 text-sm text-right font-mono text-orange-400">{Number(p.inssEmployee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="py-3 text-sm text-right font-mono text-red-400">{Number(p.irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="py-3 text-sm text-right font-mono text-purple-400">{Number(p.fgts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="py-3 text-sm text-right font-mono text-blue-400">{p.overtimeHours > 0 ? `${p.overtimeHours}h` : '—'}</td>
                    <td className="py-3 text-sm text-right font-mono text-green-400 font-semibold">{Number(p.netSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === 'approved' || p.status === 'paid'
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-yellow-400/10 text-yellow-400'
                      }`}>
                        {p.status === 'approved' ? 'Aprovado' : p.status === 'paid' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="btn-ghost p-1">
                        {expanded === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr>
                      <td colSpan={9} className="bg-[#0f1117] px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div className="space-y-2">
                            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Proventos</p>
                            <div className="flex justify-between"><span className="text-gray-400">Salário Base</span><span className="text-white font-mono">{Number(p.baseSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            {p.overtimeValue > 0 && <div className="flex justify-between"><span className="text-gray-400">Horas Extras ({p.overtimeHours}h)</span><span className="text-blue-400 font-mono">+{Number(p.overtimeValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                            {p.bonuses > 0 && <div className="flex justify-between"><span className="text-gray-400">Bonificações</span><span className="text-green-400 font-mono">+{Number(p.bonuses).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                          </div>
                          <div className="space-y-2">
                            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Descontos</p>
                            <div className="flex justify-between"><span className="text-gray-400">INSS</span><span className="text-orange-400 font-mono">-{Number(p.inssEmployee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">IRRF</span><span className="text-red-400 font-mono">-{Number(p.irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            {p.otherDeductions > 0 && <div className="flex justify-between"><span className="text-gray-400">Outros</span><span className="text-red-400 font-mono">-{Number(p.otherDeductions).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                          </div>
                          <div className="space-y-2">
                            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Encargos Patronais</p>
                            <div className="flex justify-between"><span className="text-gray-400">FGTS (8%)</span><span className="text-purple-400 font-mono">{Number(p.fgts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">INSS Patronal</span><span className="text-purple-400 font-mono">{Number(p.inssEmployer).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between pt-2 border-t border-[#1e2740]"><span className="text-gray-300 font-medium">Custo Total</span><span className="text-white font-mono font-semibold">{(Number(p.grossSalary) + Number(p.fgts) + Number(p.inssEmployer)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="bg-[#161b2e]/50 font-semibold">
                <td className="py-3 text-sm text-gray-300">TOTAIS</td>
                <td className="py-3 text-sm text-right font-mono text-white">{totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="py-3 text-sm text-right font-mono text-orange-400">{totalInss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="py-3 text-sm text-right font-mono text-red-400">{totalIrrf.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="py-3 text-sm text-right font-mono text-purple-400">{totalFgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td></td>
                <td className="py-3 text-sm text-right font-mono text-green-400">{totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td colSpan={2} className="py-3 text-xs text-right text-gray-500">+ INSS patronal: {totalInssEmpresa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {anomalias.length > 0 && (
        <div className="card-aura">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4 text-indigo-400" />
            Análise de IA — Anomalias Detectadas
          </h3>
          <div className="space-y-3">
            {anomalias.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                a.tipo === 'warning' ? 'bg-yellow-400/5 border-yellow-400/20'
                : a.tipo === 'ok' ? 'bg-green-400/5 border-green-400/20'
                : 'bg-blue-400/5 border-blue-400/20'
              }`}>
                {a.tipo === 'warning' ? <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  : a.tipo === 'ok' ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                  : <Brain className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />}
                <p className={`text-sm ${a.tipo === 'warning' ? 'text-yellow-200' : a.tipo === 'ok' ? 'text-green-200' : 'text-blue-200'}`}>{a.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
