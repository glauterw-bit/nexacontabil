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

  const cfg = {
    rascunho: { label: 'Rascunho', color: 'text-gray-400', bg: 'bg-gray-400/10', border: 'border-gray-400/30' },
    aprovada: { label: 'Aprovada', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
    paga: { label: 'Paga', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
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
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver a folha de pagamento.</p>
        <Link href="/companies" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
          Gerenciar Empresas
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Folha de Pagamento</h1>
          <p className="text-gray-400 text-sm mt-0.5">{selectedCompany.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-3 py-1 rounded-full border font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.label}
          </span>
          {!allGenerated && (
            <button
              onClick={gerarFolha}
              disabled={generating || ativos.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {generating ? 'Calculando…' : 'Gerar / Recalcular Folha'}
            </button>
          )}
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1e2740] hover:bg-[#2a3550] text-white border border-[#2a3550] rounded-lg"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Novo funcionário
          </button>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (mes === 0) { setMes(11); setAno((a) => a - 1); } else setMes((m) => m - 1);
          }}
          className="p-1.5 text-gray-400 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-white font-medium min-w-[140px] text-center text-sm">
          {MESES[mes]} {ano}
        </span>
        <button
          onClick={() => {
            if (mes === 11) { setMes(0); setAno((a) => a + 1); } else setMes((m) => m + 1);
          }}
          className="p-1.5 text-gray-400 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard icon={Users} color="text-indigo-400" label="Funcionários" value={String(ativos.length)} hint={`${employees.length - ativos.length} inativos`} />
        <SummaryCard icon={DollarSign} color="text-blue-400" label="Total Bruto" value={brl(totalBruto)} />
        <SummaryCard icon={DollarSign} color="text-orange-400" label="Total INSS" value={brl(totalInss)} />
        <SummaryCard icon={DollarSign} color="text-purple-400" label="Total FGTS" value={brl(totalFgts)} />
        <SummaryCard icon={DollarSign} color="text-green-400" label="Total Líquido" value={brl(totalLiquido)} highlight />
      </div>

      {/* Employee list */}
      <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white">Holerites — {MESES[mes]} {ano}</h2>
          {(empLoading || pLoading) && <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />}
        </div>

        {ativos.length === 0 && !empLoading ? (
          <div className="text-center py-10">
            <Users className="h-8 w-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">Nenhum funcionário cadastrado</p>
            <p className="text-xs text-gray-500 mt-1">Cadastre o primeiro funcionário para começar a folha.</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
            >
              <Plus className="h-3.5 w-3.5" />
              Cadastrar funcionário
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
                  <th className="pb-3 font-medium">Funcionário</th>
                  <th className="pb-3 font-medium text-right">Bruto</th>
                  <th className="pb-3 font-medium text-right">INSS</th>
                  <th className="pb-3 font-medium text-right">IRRF</th>
                  <th className="pb-3 font-medium text-right">FGTS</th>
                  <th className="pb-3 font-medium text-right">Líquido</th>
                  <th className="pb-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2740]">
                {ativos.map((f) => {
                  const p = payslipByEmp.get(f.id);
                  const generated = !!p;
                  return (
                    <tr key={f.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3">
                        <p className="text-white font-medium">{f.name}</p>
                        <p className="text-gray-500 text-xs">{f.role}{f.department ? ` · ${f.department}` : ''}</p>
                      </td>
                      <td className="py-3 text-right font-mono text-white">{brl(p ? p.grossSalary : f.baseSalary)}</td>
                      <td className="py-3 text-right font-mono text-orange-400">{p ? brl(p.inssEmployee) : '—'}</td>
                      <td className="py-3 text-right font-mono text-red-400">{p ? brl(p.irrf) : '—'}</td>
                      <td className="py-3 text-right font-mono text-purple-400">{p ? brl(p.fgts) : '—'}</td>
                      <td className="py-3 text-right font-mono text-green-400 font-semibold">
                        {p ? brl(p.netSalary) : '—'}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            generated
                              ? 'bg-green-400/10 text-green-400'
                              : 'bg-yellow-400/10 text-yellow-400'
                          }`}
                        >
                          {generated ? 'Calculado' : 'Pendente'}
                        </span>
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
  icon: Icon, color, label, value, hint, highlight,
}: {
  icon: any; color: string; label: string; value: string; hint?: string; highlight?: boolean;
}) {
  return (
    <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-lg font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</p>
      {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-white">Novo funcionário</h2>
        <Field label="Nome completo">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF">
            <input
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </Field>
          <Field label="Admissão">
            <input
              type="date"
              required
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
            />
          </Field>
        </div>
        <Field label="Cargo">
          <input
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </Field>
        <Field label="Departamento (opcional)">
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
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
            className="w-full px-3 py-2 bg-[#161b2e] border border-[#1e2740] rounded-lg text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-gray-300 bg-[#1e2740] hover:bg-[#2a3550] rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg inline-flex items-center justify-center gap-1.5"
          >
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
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
