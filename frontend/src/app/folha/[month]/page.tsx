'use client';
import { useState, Fragment } from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronDown, ChevronUp, Download, CheckCircle, Brain, AlertTriangle,
  ArrowLeft, Loader2, Calculator, Building2, DollarSign,
} from 'lucide-react';
import { PageHeader, SectionTitle, StatusChip, EmptyState, Spinner, COLORS } from '@/components/ui/kit';
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/folha" className="btn-ghost mt-2"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="flex-1">
          <PageHeader
            icon={<DollarSign size={22} color={COLORS.acao} />}
            title={`Folha de Pagamento — ${titulo}`}
            subtitle={`${selectedCompany.name} · ${payslips.length} holerites`}
            action={
              <div className="flex gap-2 flex-wrap">
                <button onClick={calculateAllMissing} disabled={calculating} className="btn-secondary">
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  Calcular faltantes
                </button>
                <button className="btn-secondary">
                  <Download className="h-4 w-4" /> PDF
                </button>
                <button onClick={aprovarTodos} className="btn-primary">
                  <CheckCircle className="h-4 w-4" /> Aprovar Todos
                </button>
              </div>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Bruto', value: totalBruto },
          { label: 'INSS', value: totalInss },
          { label: 'IRRF', value: totalIrrf },
          { label: 'FGTS', value: totalFgts },
          { label: 'Líquido', value: totalLiquido },
        ].map(t => (
          <div key={t.label} className="card-aura text-center">
            <p className="text-xs text-tx-muted mb-1">{t.label}</p>
            <p className="num text-lg font-bold text-tx-strong">{Number(t.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
        ))}
      </div>

      <div className="card-aura overflow-x-auto">
        {loading && payslips.length === 0 ? (
          <Spinner />
        ) : payslips.length === 0 ? (
          <div className="text-center py-6">
            <EmptyState icon={<Calculator size={32} />} title={`Nenhum holerite calculado para ${titulo}.`} />
            <button onClick={calculateAllMissing} disabled={calculating || allEmployees.length === 0} className="btn-primary inline-flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Calcular folha do mês
            </button>
            {allEmployees.length === 0 && (
              <p className="text-xs text-tx-faint mt-3">
                Nenhum colaborador cadastrado. <Link href="/folha/colaboradores" className="text-acao hover:underline">Cadastrar →</Link>
              </p>
            )}
          </div>
        ) : (
          <table className="table-aura min-w-[800px]">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th className="num">Bruto</th>
                <th className="num">INSS</th>
                <th className="num">IRRF</th>
                <th className="num">FGTS</th>
                <th className="num">H.Ex.</th>
                <th className="num">Líquido</th>
                <th className="text-center">Status</th>
                <th className="text-center"></th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p: any) => (
                <Fragment key={p.id}>
                  <tr>
                    <td>
                      <p className="text-tx-strong font-medium">{p.employee?.name ?? p.employeeId}</p>
                      <p className="text-tx-muted text-xs">{p.employee?.role}</p>
                    </td>
                    <td className="num text-tx-strong">{Number(p.grossSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="num">{Number(p.inssEmployee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="num">{Number(p.irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="num">{Number(p.fgts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="num">{p.overtimeHours > 0 ? `${p.overtimeHours}h` : '—'}</td>
                    <td className="num text-tx-strong font-semibold">{Number(p.netSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td className="text-center">
                      <StatusChip
                        size="sm"
                        tone={p.status === 'approved' || p.status === 'paid' ? 'ok' : 'pendente'}
                        label={p.status === 'approved' ? 'Aprovado' : p.status === 'paid' ? 'Pago' : 'Pendente'}
                      />
                    </td>
                    <td className="text-center">
                      <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="btn-ghost p-1">
                        {expanded === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr>
                      <td colSpan={9} className="bg-inset px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div className="space-y-2">
                            <p className="text-tx-faint text-[11px] font-semibold uppercase tracking-wide">Proventos</p>
                            <div className="flex justify-between"><span className="text-tx-muted">Salário Base</span><span className="num text-tx-strong">{Number(p.baseSalary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            {p.overtimeValue > 0 && <div className="flex justify-between"><span className="text-tx-muted">Horas Extras ({p.overtimeHours}h)</span><span className="num text-ok">+{Number(p.overtimeValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                            {p.bonuses > 0 && <div className="flex justify-between"><span className="text-tx-muted">Bonificações</span><span className="num text-ok">+{Number(p.bonuses).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                          </div>
                          <div className="space-y-2">
                            <p className="text-tx-faint text-[11px] font-semibold uppercase tracking-wide">Descontos</p>
                            <div className="flex justify-between"><span className="text-tx-muted">INSS</span><span className="num text-err">-{Number(p.inssEmployee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between"><span className="text-tx-muted">IRRF</span><span className="num text-err">-{Number(p.irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            {p.otherDeductions > 0 && <div className="flex justify-between"><span className="text-tx-muted">Outros</span><span className="num text-err">-{Number(p.otherDeductions).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                          </div>
                          <div className="space-y-2">
                            <p className="text-tx-faint text-[11px] font-semibold uppercase tracking-wide">Encargos Patronais</p>
                            <div className="flex justify-between"><span className="text-tx-muted">FGTS (8%)</span><span className="num text-tx">{Number(p.fgts).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between"><span className="text-tx-muted">INSS Patronal</span><span className="num text-tx">{Number(p.inssEmployer).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                            <div className="flex justify-between pt-2 border-t border-line"><span className="text-tx font-medium">Custo Total</span><span className="num text-tx-strong font-semibold">{(Number(p.grossSalary) + Number(p.fgts) + Number(p.inssEmployer)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="bg-inset font-semibold">
                <td className="text-tx">TOTAIS</td>
                <td className="num text-tx-strong">{totalBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="num">{totalInss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="num">{totalIrrf.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="num">{totalFgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td></td>
                <td className="num text-tx-strong">{totalLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td colSpan={2} className="text-xs text-right text-tx-muted">+ INSS patronal: {totalInssEmpresa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {anomalias.length > 0 && (
        <div className="card-aura">
          <SectionTitle>
            <Brain className="h-4 w-4 text-tx-muted" />
            Análise de IA — Anomalias Detectadas
          </SectionTitle>
          <div className="space-y-3">
            {anomalias.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                a.tipo === 'warning' ? 'bg-yellow-400/5 border-yellow-400/20'
                : a.tipo === 'ok' ? 'bg-green-400/5 border-green-400/20'
                : 'bg-blue-400/5 border-blue-400/20'
              }`}>
                {a.tipo === 'warning' ? <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
                  : a.tipo === 'ok' ? <CheckCircle className="h-4 w-4 text-ok flex-shrink-0 mt-0.5" />
                  : <Brain className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />}
                <p className={`text-sm ${a.tipo === 'warning' ? 'text-warn' : a.tipo === 'ok' ? 'text-ok' : 'text-info'}`}>{a.msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
