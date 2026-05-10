'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ChevronDown, ChevronUp, Download, CheckCircle, Brain, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

interface FuncionarioDetalhe {
  id: string;
  nome: string;
  cargo: string;
  bruto: number;
  inss: number;
  irrf: number;
  fgts: number;
  liquido: number;
  horasExtras: number;
  valorExtras: number;
  valeTransporte: number;
  valeRefeicao: number;
  adiantamento: number;
  status: 'pendente' | 'aprovado';
}

const MOCK_DETALHE: FuncionarioDetalhe[] = [
  { id: '1', nome: 'Ana Paula Ferreira', cargo: 'Gerente Contábil', bruto: 8500, inss: 935, irrf: 892.07, fgts: 680, liquido: 6672.93, horasExtras: 8, valorExtras: 453.33, valeTransporte: 330, valeRefeicao: 440, adiantamento: 0, status: 'aprovado' },
  { id: '2', nome: 'Carlos Eduardo Silva', cargo: 'Analista Fiscal', bruto: 5800, inss: 638, irrf: 401.24, fgts: 464, liquido: 4760.76, horasExtras: 4, valorExtras: 162.22, valeTransporte: 220, valeRefeicao: 440, adiantamento: 500, status: 'aprovado' },
  { id: '3', nome: 'Maria Fernanda Costa', cargo: 'Assistente Contábil', bruto: 3200, inss: 316, irrf: 0, fgts: 256, liquido: 2884, horasExtras: 0, valorExtras: 0, valeTransporte: 176, valeRefeicao: 440, adiantamento: 0, status: 'pendente' },
  { id: '4', nome: 'João Ricardo Alves', cargo: 'Desenvolvedor', bruto: 7200, inss: 792, irrf: 624.80, fgts: 576, liquido: 5783.20, horasExtras: 12, valorExtras: 480, valeTransporte: 264, valeRefeicao: 440, adiantamento: 1000, status: 'pendente' },
  { id: '5', nome: 'Patrícia Lima Santos', cargo: 'RH Generalist', bruto: 4600, inss: 506, irrf: 178.92, fgts: 368, liquido: 3915.08, horasExtras: 0, valorExtras: 0, valeTransporte: 242, valeRefeicao: 440, adiantamento: 0, status: 'pendente' },
];

const AI_ANOMALIES = [
  { tipo: 'warning', msg: 'João Ricardo Alves tem 12 horas extras — acima do limite legal de 10h. Verifique a conformidade com a CLT.' },
  { tipo: 'info', msg: 'Carlos Eduardo Silva tem adiantamento de R$ 500 pendente. O desconto será aplicado nesta folha.' },
  { tipo: 'ok', msg: 'INSS e IRRF calculados dentro dos parâmetros da tabela progressiva 2026. Sem inconsistências.' },
];

export default function FolhaDetalhesMesPage() {
  const { month } = useParams<{ month: string }>();
  const { selectedCompany } = useCompany();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState(MOCK_DETALHE);

  const [mes, ano] = (() => {
    if (!month) return ['Março', '2026'];
    const [y, m] = month.split('-');
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return [meses[parseInt(m) - 1] || 'Março', y || '2026'];
  })();

  const aprovarTodos = () => setFuncionarios(prev => prev.map(f => ({ ...f, status: 'aprovado' as const })));

  const totalBruto = funcionarios.reduce((s, f) => s + f.bruto, 0);
  const totalInss = funcionarios.reduce((s, f) => s + f.inss, 0);
  const totalIrrf = funcionarios.reduce((s, f) => s + f.irrf, 0);
  const totalFgts = funcionarios.reduce((s, f) => s + f.fgts, 0);
  const totalLiquido = funcionarios.reduce((s, f) => s + f.liquido, 0);

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/folha" className="btn-ghost p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Folha de Pagamento — {mes} {ano}</h1>
            <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-ghost text-sm border border-[#1e2740]">
            <Download className="h-4 w-4" /> PDF
          </button>
          <button className="btn-ghost text-sm border border-[#1e2740]">
            <Download className="h-4 w-4" /> Excel
          </button>
          <button onClick={aprovarTodos} className="btn-primary text-sm">
            <CheckCircle className="h-4 w-4" /> Aprovar Todos
          </button>
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Total Bruto', value: totalBruto, color: 'text-white' },
          { label: 'Total INSS', value: totalInss, color: 'text-orange-400' },
          { label: 'Total IRRF', value: totalIrrf, color: 'text-red-400' },
          { label: 'Total FGTS', value: totalFgts, color: 'text-purple-400' },
          { label: 'Total Líquido', value: totalLiquido, color: 'text-green-400' },
        ].map(t => (
          <div key={t.label} className="card-aura text-center">
            <p className="text-xs text-gray-500 mb-1">{t.label}</p>
            <p className={`text-lg font-bold ${t.color}`}>{t.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card-aura">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-[#1e2740]">
              <th className="pb-3 font-medium">Funcionário</th>
              <th className="pb-3 font-medium text-right">Bruto</th>
              <th className="pb-3 font-medium text-right">INSS</th>
              <th className="pb-3 font-medium text-right">IRRF</th>
              <th className="pb-3 font-medium text-right">FGTS</th>
              <th className="pb-3 font-medium text-right">H. Extras</th>
              <th className="pb-3 font-medium text-right">Líquido</th>
              <th className="pb-3 font-medium text-center">Status</th>
              <th className="pb-3 font-medium text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2740]">
            {funcionarios.map(f => (
              <>
                <tr key={f.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3">
                    <p className="text-white text-sm font-medium">{f.nome}</p>
                    <p className="text-gray-500 text-xs">{f.cargo}</p>
                  </td>
                  <td className="py-3 text-sm text-right font-mono text-white">{f.bruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-orange-400">{f.inss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-red-400">{f.irrf.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-purple-400">{f.fgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-sm text-right font-mono text-blue-400">
                    {f.horasExtras > 0 ? `${f.horasExtras}h` : '—'}
                  </td>
                  <td className="py-3 text-sm text-right font-mono text-green-400 font-semibold">{f.liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.status === 'aprovado' ? 'bg-green-400/10 text-green-400' : 'bg-yellow-400/10 text-yellow-400'}`}>
                      {f.status === 'aprovado' ? 'Aprovado' : 'Pendente'}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <button onClick={() => setExpanded(expanded === f.id ? null : f.id)} className="btn-ghost p-1">
                      {expanded === f.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
                {expanded === f.id && (
                  <tr key={`${f.id}-detail`}>
                    <td colSpan={9} className="bg-[#0f1117] px-4 py-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="space-y-2">
                          <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Proventos</p>
                          <div className="flex justify-between"><span className="text-gray-400">Salário Base</span><span className="text-white font-mono">{(f.bruto - f.valorExtras).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          {f.valorExtras > 0 && <div className="flex justify-between"><span className="text-gray-400">Horas Extras ({f.horasExtras}h)</span><span className="text-blue-400 font-mono">+{f.valorExtras.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                          <div className="flex justify-between"><span className="text-gray-400">Vale Alimentação</span><span className="text-green-400 font-mono">+{f.valeRefeicao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Descontos</p>
                          <div className="flex justify-between"><span className="text-gray-400">INSS</span><span className="text-orange-400 font-mono">-{f.inss.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">IRRF</span><span className="text-red-400 font-mono">-{f.irrf.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Vale Transporte</span><span className="text-yellow-400 font-mono">-{f.valeTransporte.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          {f.adiantamento > 0 && <div className="flex justify-between"><span className="text-gray-400">Adiantamento</span><span className="text-red-400 font-mono">-{f.adiantamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>}
                        </div>
                        <div className="space-y-2">
                          <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Encargos Patronais</p>
                          <div className="flex justify-between"><span className="text-gray-400">FGTS (8%)</span><span className="text-purple-400 font-mono">{f.fgts.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">INSS Patronal</span><span className="text-purple-400 font-mono">{(f.bruto * 0.2).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                          <div className="flex justify-between pt-2 border-t border-[#1e2740]"><span className="text-gray-300 font-medium">Custo Total</span><span className="text-white font-mono font-semibold">{(f.bruto * 1.28).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Panel */}
      <div className="card-aura">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-400" />
          Análise de IA — Anomalias Detectadas
        </h3>
        <div className="space-y-3">
          {AI_ANOMALIES.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${a.tipo === 'warning' ? 'bg-yellow-400/5 border-yellow-400/20' : a.tipo === 'ok' ? 'bg-green-400/5 border-green-400/20' : 'bg-blue-400/5 border-blue-400/20'}`}>
              {a.tipo === 'warning' ? <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" /> : a.tipo === 'ok' ? <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" /> : <Brain className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />}
              <p className={`text-sm ${a.tipo === 'warning' ? 'text-yellow-200' : a.tipo === 'ok' ? 'text-green-200' : 'text-blue-200'}`}>{a.msg}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
