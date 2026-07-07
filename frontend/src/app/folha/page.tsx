'use client';
import { useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import {
  Users, DollarSign, CheckCircle, ChevronLeft, ChevronRight,
  FileText, AlertTriangle, Plus, Loader2, UserPlus,
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, SectionTitle, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';
import type { StatusTone } from '@/components/ui/kit';

const LIST_EMPLOYEES = gql`
  query Employees($companyId: String!) {
    employees(companyId: $companyId) {
      id name cpf role department admissionDate dismissalDate baseSalary
      workHoursWeekly dependents active
    }
  }
`;

const LIST_PAYSLIPS = gql`
  query Payslips($companyId: String!, $month: String!) {
    payslips(companyId: $companyId, referenceMonth: $month) {
      id employeeId referenceMonth
      grossSalary inssEmployee irrf fgts netSalary status
      employee { id name role department }
    }
  }
`;

const CREATE_EMPLOYEE = gql`
  mutation CreateEmployee($input: CreateEmployeeInput!) {
    createEmployee(input: $input) {
      id name cpf role baseSalary
    }
  }
`;

const CALCULATE_PAYSLIP = gql`
  mutation CalculatePayslip($input: CalculatePayslipInput!) {
    calculatePayslip(input: $input) {
      id employeeId grossSalary netSalary status
    }
  }
`;

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const brl = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FolhaPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [showNew, setShowNew] = useState(false);
  const [generating, setGenerating] = useState(false);

  const companyId = selectedCompany?.id ?? '';
  const refMonth = `${ano}-${String(mes + 1).padStart(2, '0')}`;

  const { data: empData, refetch: refetchEmp, loading: empLoading } = useQuery(LIST_EMPLOYEES, {
    variables: { companyId },
    skip: !companyId,
  });
  const { data: pData, refetch: refetchPayslips, loading: pLoading } = useQuery(LIST_PAYSLIPS, {
    variables: { companyId, month: refMonth },
    skip: !companyId,
  });

  const [createEmployee, { loading: creating }] = useMutation(CREATE_EMPLOYEE, {
    onCompleted: () => {
      toast.push('Funcionário cadastrado', { variant: 'success' });
      setShowNew(false);
      refetchEmp();
    },
    onError: (e) => toast.push(e.message, { variant: 'error', title: 'Erro' }),
  });
  const [calculatePayslip] = useMutation(CALCULATE_PAYSLIP, {
    onError: (e) => toast.push(e.message, { variant: 'error', title: 'Erro' }),
  });

  const employees: any[] = empData?.employees ?? [];
  const payslips: any[] = pData?.payslips ?? [];
  const ativos = employees.filter((e) => e.active && !e.dismissalDate);

  // Map payslip por employeeId pra mostrar valores reais do mês
  const payslipByEmp = new Map<string, any>();
  for (const p of payslips) payslipByEmp.set(p.employeeId, p);

  const totalBruto = payslips.reduce((s, p) => s + (p.grossSalary || 0), 0);
  const totalInss = payslips.reduce((s, p) => s + (p.inssEmployee || 0), 0);
  const totalIrrf = payslips.reduce((s, p) => s + (p.irrf || 0), 0);
  const totalFgts = payslips.reduce((s, p) => s + (p.fgts || 0), 0);
  const totalLiquido = payslips.reduce((s, p) => s + (p.netSalary || 0), 0);

  const allGenerated = ativos.length > 0 && payslips.length >= ativos.length;
  const folhaStatus = payslips.length === 0
    ? 'rascunho'
    : payslips.every((p) => p.status === 'paid')
    ? 'paga'
    : payslips.every((p) => p.status !== 'draft')
    ? 'aprovada'
    : 'rascunho';

  const cfg: { label: string; tone: StatusTone } = {
    rascunho: { label: 'Rascunho', tone: 'pendente' as StatusTone },
    aprovada: { label: 'Aprovada', tone: 'processando' as StatusTone },
    paga: { label: 'Paga', tone: 'ok' as StatusTone },
  }[folhaStatus];

  async function gerarFolha() {
    if (ativos.length === 0) {
      toast.push('Cadastre funcionários antes de gerar a folha', { variant: 'warning' });
      return;
    }
    setGenerating(true);
    let ok = 0;
    let err = 0;
    for (const emp of ativos) {
      if (payslipByEmp.has(emp.id)) continue;
      try {
        await calculatePayslip({
          variables: {
            input: { employeeId: emp.id, companyId, referenceMonth: refMonth },
          },
        });
        ok++;
      } catch {
        err++;
      }
    }
    setGenerating(false);
    toast.push(`Folha gerada: ${ok} sucesso, ${err} erro(s)`, {
      variant: err > 0 ? 'warning' : 'success',
    });
    refetchPayslips();
  }

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState
          icon={<Building2 size={40} />}
          title="Selecione uma empresa para ver a folha de pagamento."
        />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<DollarSign size={22} color={COLORS.acao} />}
        title="Folha de Pagamento"
        subtitle={selectedCompany.name}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip tone={cfg.tone} label={cfg.label} />
            {!allGenerated && (
              <button
                onClick={gerarFolha}
                disabled={generating || ativos.length === 0}
                className="btn-primary"
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {generating ? 'Calculando…' : 'Gerar / Recalcular Folha'}
              </button>
            )}
            <button onClick={() => setShowNew(true)} className="btn-secondary">
              <UserPlus className="h-3.5 w-3.5" />
              Novo funcionário
            </button>
          </div>
        }
      />

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (mes === 0) { setMes(11); setAno((a) => a - 1); } else setMes((m) => m - 1);
          }}
          className="btn-ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-tx-strong font-medium min-w-[140px] text-center text-sm">
          {MESES[mes]} {ano}
        </span>
        <button
          onClick={() => {
            if (mes === 11) { setMes(0); setAno((a) => a + 1); } else setMes((m) => m + 1);
          }}
          className="btn-ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard icon={Users} label="Funcionários" value={String(ativos.length)} hint={`${employees.length - ativos.length} inativos`} />
        <SummaryCard icon={DollarSign} label="Total Bruto" value={brl(totalBruto)} />
        <SummaryCard icon={DollarSign} label="Total INSS" value={brl(totalInss)} />
        <SummaryCard icon={DollarSign} label="Total FGTS" value={brl(totalFgts)} />
        <SummaryCard icon={DollarSign} label="Total Líquido" value={brl(totalLiquido)} highlight />
      </div>

      {/* Employee list */}
      <div className="card-aura">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Holerites — {MESES[mes]} {ano}</SectionTitle>
          {(empLoading || pLoading) && <Loader2 className="h-4 w-4 text-tx-muted animate-spin" />}
        </div>

        {ativos.length === 0 && !empLoading ? (
          <div className="text-center">
            <EmptyState
              icon={<Users size={32} />}
              title="Nenhum funcionário cadastrado"
              sub="Cadastre o primeiro funcionário para começar a folha."
            />
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus className="h-3.5 w-3.5" />
              Cadastrar funcionário
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th className="num">Bruto</th>
                  <th className="num">INSS</th>
                  <th className="num">IRRF</th>
                  <th className="num">FGTS</th>
                  <th className="num">Líquido</th>
                  <th className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {ativos.map((f) => {
                  const p = payslipByEmp.get(f.id);
                  const generated = !!p;
                  return (
                    <tr key={f.id}>
                      <td>
                        <p className="text-tx-strong font-medium">{f.name}</p>
                        <p className="text-tx-muted text-xs">{f.role}{f.department ? ` · ${f.department}` : ''}</p>
                      </td>
                      <td className="num text-tx-strong">{brl(p ? p.grossSalary : f.baseSalary)}</td>
                      <td className="num">{p ? brl(p.inssEmployee) : '—'}</td>
                      <td className="num">{p ? brl(p.irrf) : '—'}</td>
                      <td className="num">{p ? brl(p.fgts) : '—'}</td>
                      <td className="num text-tx-strong font-semibold">
                        {p ? brl(p.netSalary) : '—'}
                      </td>
                      <td className="text-center">
                        <StatusChip
                          size="sm"
                          tone={generated ? 'ok' : 'pendente'}
                          label={generated ? 'Calculado' : 'Pendente'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New employee modal */}
      {showNew && (
        <NewEmployeeModal
          companyId={companyId}
          onClose={() => setShowNew(false)}
          onSubmit={(input) => createEmployee({ variables: { input } })}
          submitting={creating}
        />
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, hint, highlight,
}: {
  icon: any; label: string; value: string; hint?: string; highlight?: boolean;
}) {
  return (
    <div className="card-aura">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 text-tx-muted" />
        <p className="text-xs text-tx-muted">{label}</p>
      </div>
      <p className={`num text-lg font-bold ${highlight ? 'text-ok' : 'text-tx-strong'}`}>{value}</p>
      {hint && <p className="text-xs text-tx-faint mt-0.5">{hint}</p>}
    </div>
  );
}

function NewEmployeeModal({
  companyId, onClose, onSubmit, submitting,
}: {
  companyId: string;
  onClose: () => void;
  onSubmit: (input: any) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      companyId,
      name,
      cpf: cpf.replace(/\D/g, ''),
      role,
      department: department || undefined,
      baseSalary: Number(baseSalary),
      admissionDate: new Date(admissionDate),
    });
  }

  return (
    <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-card border border-line rounded-xl shadow-pop p-6 space-y-4"
      >
        <h2 className="text-[15px] font-semibold text-tx-strong">Novo funcionário</h2>
        <Field label="Nome completo">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-aura w-full"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF">
            <input
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="input-aura w-full"
            />
          </Field>
          <Field label="Admissão">
            <input
              type="date"
              required
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="input-aura w-full"
            />
          </Field>
        </div>
        <Field label="Cargo">
          <input
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input-aura w-full"
          />
        </Field>
        <Field label="Departamento (opcional)">
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="input-aura w-full"
          />
        </Field>
        <Field label="Salário base (R$)">
          <input
            required
            type="number"
            step="0.01"
            min="1"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            className="input-aura w-full"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Cadastrar
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-tx-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
