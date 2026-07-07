'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Brain, Calculator, TrendingDown, CheckCircle } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, COLORS, tint, EmptyState, StatusChip } from '@/components/ui/kit';

interface Inputs {
  faturamento: string;
  custos: string;
  despesas: string;
  folha: string;
  atividade: string;
  regimeAtual: string;
}

interface Resultado {
  regime: string;
  impostoAnual: number;
  impostoMensal: number;
  aliquotaEfetiva: number;
  melhor: boolean;
  detalhes: Record<string, number>;
}

function calcularRegimes(inputs: Inputs): Resultado[] {
  const fat = parseFloat(inputs.faturamento) || 0;
  const custos = parseFloat(inputs.custos) || 0;
  const desp = parseFloat(inputs.despesas) || 0;
  const folha = parseFloat(inputs.folha) || 0;
  const lucroReal = fat - custos - desp - folha;

  // Simples Nacional (tabela Anexo III - Serviços)
  let simplesAliq = 0.06;
  if (fat <= 180000) simplesAliq = 0.06;
  else if (fat <= 360000) simplesAliq = 0.112;
  else if (fat <= 720000) simplesAliq = 0.135;
  else if (fat <= 1800000) simplesAliq = 0.16;
  else if (fat <= 3600000) simplesAliq = 0.21;
  else simplesAliq = 0.33;
  const simplesTotal = fat * simplesAliq;

  // Lucro Presumido
  let presuncao = inputs.atividade === 'comercio' ? 0.08 : 0.32;
  const lucroPresumido = fat * presuncao;
  const irpjPres = lucroPresumido * 0.15 + Math.max(0, lucroPresumido - 240000) * 0.1;
  const csllPres = lucroPresumido * 0.09;
  const pisCof = fat * 0.0365; // PIS 0,65% + COFINS 3% cumulativo
  const presTotal = irpjPres + csllPres + pisCof;

  // Lucro Real
  const irpjReal = lucroReal > 0 ? lucroReal * 0.15 + Math.max(0, lucroReal - 240000) * 0.1 : 0;
  const csllReal = lucroReal > 0 ? lucroReal * 0.09 : 0;
  const pisReal = fat * 0.0165; // PIS 1,65% não cumulativo
  const cofinsReal = fat * 0.076; // COFINS 7,6% não cumulativo
  const realTotal = irpjReal + csllReal + pisReal + cofinsReal;

  const resultados: Resultado[] = [
    {
      regime: 'Simples Nacional',
      impostoAnual: simplesTotal,
      impostoMensal: simplesTotal / 12,
      aliquotaEfetiva: fat > 0 ? (simplesTotal / fat) * 100 : 0,
      melhor: false,
      detalhes: { 'DAS': simplesTotal },
    },
    {
      regime: 'Lucro Presumido',
      impostoAnual: presTotal,
      impostoMensal: presTotal / 12,
      aliquotaEfetiva: fat > 0 ? (presTotal / fat) * 100 : 0,
      melhor: false,
      detalhes: { 'IRPJ': irpjPres, 'CSLL': csllPres, 'PIS/COFINS': pisCof },
    },
    {
      regime: 'Lucro Real',
      impostoAnual: realTotal,
      impostoMensal: realTotal / 12,
      aliquotaEfetiva: fat > 0 ? (realTotal / fat) * 100 : 0,
      melhor: false,
      detalhes: { 'IRPJ': irpjReal, 'CSLL': csllReal, 'PIS': pisReal, 'COFINS': cofinsReal },
    },
  ];

  // Find best
  const minIdx = resultados.reduce((min, r, i) => r.impostoAnual < resultados[min].impostoAnual ? i : min, 0);
  resultados[minIdx].melhor = true;

  return resultados;
}

export default function TributarioPage() {
  const { selectedCompany } = useCompany();
  const [inputs, setInputs] = useState<Inputs>({
    faturamento: '1200000',
    custos: '360000',
    despesas: '180000',
    folha: '240000',
    atividade: 'servicos',
    regimeAtual: 'simples',
  });
  const [calculado, setCalculado] = useState(true);
  const [resultados, setResultados] = useState<Resultado[]>(() => calcularRegimes({
    faturamento: '1200000', custos: '360000', despesas: '180000', folha: '240000',
    atividade: 'servicos', regimeAtual: 'simples',
  }));

  const calcular = () => {
    setResultados(calcularRegimes(inputs));
    setCalculado(true);
  };

  const melhor = resultados.find(r => r.melhor);
  const atual = resultados.find(r => r.regime.toLowerCase().includes(inputs.regimeAtual));
  const economia = atual && melhor ? atual.impostoAnual - melhor.impostoAnual : 0;

  const chartData = resultados.map(r => ({ name: r.regime.replace(' ', '\n'), valor: r.impostoAnual, melhor: r.melhor }));

  if (!selectedCompany) {
    return (
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa para fazer o planejamento tributário." />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Calculator size={22} color={COLORS.acao} />}
        title="Planejamento Tributário"
        subtitle={`${selectedCompany.name} · Comparativo de Regimes Fiscais`}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Input form */}
        <div className="card-aura space-y-4">
          <h3 className="text-[15px] font-semibold text-tx-strong m-0 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-tx-muted" />
            Parâmetros da Empresa
          </h3>
          {[
            { label: 'Faturamento Anual (R$)', key: 'faturamento', placeholder: '1.200.000' },
            { label: 'Custos Anuais (R$)', key: 'custos', placeholder: '360.000' },
            { label: 'Despesas Operacionais (R$)', key: 'despesas', placeholder: '180.000' },
            { label: 'Folha de Pagamento Anual (R$)', key: 'folha', placeholder: '240.000' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm text-tx-muted mb-1.5">{f.label}</label>
              <input type="number" min="0" value={(inputs as any)[f.key]}
                onChange={e => setInputs(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="input-aura w-full" />
            </div>
          ))}
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Tipo de Atividade</label>
            <select value={inputs.atividade} onChange={e => setInputs(prev => ({ ...prev, atividade: e.target.value }))}
              className="input-aura w-full">
              <option value="servicos">Serviços (presunção 32%)</option>
              <option value="comercio">Comércio (presunção 8%)</option>
              <option value="industria">Indústria (presunção 8%)</option>
              <option value="misto">Misto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Regime Atual</label>
            <select value={inputs.regimeAtual} onChange={e => setInputs(prev => ({ ...prev, regimeAtual: e.target.value }))}
              className="input-aura w-full">
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro Presumido</option>
              <option value="real">Lucro Real</option>
            </select>
          </div>
          <button onClick={calcular} className="btn-primary w-full justify-center">
            <Calculator className="h-4 w-4" /> Calcular Comparativo
          </button>
        </div>

        {/* Results */}
        <div className="xl:col-span-2 space-y-4">
          {economia > 0 && calculado && (
            <div className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
              <TrendingDown className="h-5 w-5 text-ok flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-ok font-semibold">Potencial de economia tributária detectado!</p>
                <p className="text-tx text-sm mt-1">
                  Migrando do regime atual para <strong className="text-ok">{melhor?.regime}</strong>, a economia anual seria de{' '}
                  <strong className="text-ok">{economia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  {' '}({(economia / 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês).
                </p>
              </div>
            </div>
          )}

          {/* Comparison table */}
          <div className="card-aura overflow-x-auto">
            <table className="table-aura">
              <thead>
                <tr>
                  <th>Regime</th>
                  <th className="num">Imposto Anual</th>
                  <th className="num">Imposto Mensal</th>
                  <th className="num">Alíquota Efetiva</th>
                  <th className="text-center">Indicação</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map(r => (
                  <tr key={r.regime} style={r.melhor ? { background: tint(COLORS.dotOk, 5) } : undefined}>
                    <td>
                      <p className={`text-sm font-medium ${r.melhor ? 'text-ok' : 'text-tx-strong'}`}>{r.regime}</p>
                      <div className="flex gap-2 mt-1">
                        {Object.entries(r.detalhes).map(([k, v]) => (
                          <span key={k} className="text-xs text-tx-muted">{k}: {v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        ))}
                      </div>
                    </td>
                    <td className={`num font-semibold ${r.melhor ? 'text-ok' : 'text-tx-strong'}`}>
                      {r.impostoAnual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="num">
                      {r.impostoMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className={`num font-semibold ${r.aliquotaEfetiva < 10 ? 'text-ok' : r.aliquotaEfetiva < 20 ? 'text-warn' : 'text-err'}`}>
                      {r.aliquotaEfetiva.toFixed(2)}%
                    </td>
                    <td className="text-center">
                      {r.melhor ? (
                        <StatusChip tone="ok" label="Melhor opção" size="sm" />
                      ) : (
                        <span className="text-xs text-tx-muted num">
                          +{(r.impostoAnual - (melhor?.impostoAnual || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart */}
          <div className="card-aura">
            <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-4">Comparativo Visual — Impostos Anuais</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--faint)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} labelStyle={{ color: 'var(--tx-strong)' }} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (<Cell key={i} fill={entry.melhor ? 'var(--dot-ok)' : 'var(--faint)'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* AI recommendation */}
          <div className="card-aura">
            <h3 className="text-[15px] font-semibold text-tx-strong m-0 mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-tx-muted" /> Recomendação da IA
            </h3>
            <div className="text-sm text-tx space-y-2 leading-relaxed">
              <p>Com faturamento anual de <strong className="text-tx-strong">{parseFloat(inputs.faturamento || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> e atividade de serviços, a análise indica que <strong className="text-ok">{melhor?.regime}</strong> é o regime mais vantajoso com alíquota efetiva de <strong className="text-ok">{melhor?.aliquotaEfetiva.toFixed(2)}%</strong>.</p>
              {economia > 5000 && <p className="text-warn">O potencial de redução tributária é expressivo. Recomendamos consultar um especialista para avaliar os aspectos qualitativos da migração de regime, incluindo obrigações acessórias e timing fiscal.</p>}
              <p className="text-tx-muted text-xs mt-2">* Valores estimados. A análise considera tabelas vigentes em 2026. Consulte seu contador antes de tomar decisões.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
