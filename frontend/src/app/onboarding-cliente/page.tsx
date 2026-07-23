'use client';
import { useState, useEffect } from 'react';
import { useMutation, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, Banknote, ShieldCheck, FileText, Sparkles, Check,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, CheckCircle2, RotateCw,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, COLORS, tint } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const CREATE_COMPANY = gql`
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) {
      id name cnpj taxRegime
    }
  }
`;

type Regime = 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';

interface Step1 {
  cnpj: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  clienteDesde?: string;
}

interface Step2 {
  taxRegime: Regime;
  cnae?: string;
  atividade?: string;
}

interface Step3 {
  socios: Array<{ nome: string; cpf: string; percentual: number; funcao: string }>;
}

interface Step4 {
  hasA1: boolean;
  bancos: string[];
}

const STEPS = [
  { id: 1, icon: Building2, title: 'Dados Cadastrais', desc: 'CNPJ, razão social, contato' },
  { id: 2, icon: ShieldCheck, title: 'Regime Tributário', desc: 'Simples, Presumido, Real, MEI' },
  { id: 3, icon: Users, title: 'Sócios', desc: 'Quadro societário' },
  { id: 4, icon: Banknote, title: 'Acessos', desc: 'Certificado A1 e bancos' },
  { id: 5, icon: Sparkles, title: 'Revisão', desc: 'Confirmar e gerar setup' },
];

function unmaskCnpj(v: string) { return v.replace(/\D/g, ''); }
function maskCnpj(v: string) {
  const d = unmaskCnpj(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d{0,3})?(\d{0,3})?(\d{0,4})?(\d{0,2})?$/, (_, a, b, c, d2, e) =>
    [a, b && '.' + b, c && '.' + c, d2 && '/' + d2, e && '-' + e].filter(Boolean).join('')
  );
}

export default function OnboardingClientePage() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [s1, setS1] = useState<Step1>({ cnpj: '', name: '', email: '', phone: '', address: '' });
  const [s2, setS2] = useState<Step2>({ taxRegime: 'SIMPLES_NACIONAL' });
  const [s3, setS3] = useState<Step3>({ socios: [{ nome: '', cpf: '', percentual: 100, funcao: 'Administrador' }] });
  const [s4, setS4] = useState<Step4>({ hasA1: false, bancos: [] });
  const [lookingUp, setLookingUp] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const [createCompany] = useMutation(CREATE_COMPANY);

  // Auto-fill via BrasilAPI quando CNPJ tem 14 dígitos
  useEffect(() => {
    const cnpj = unmaskCnpj(s1.cnpj);
    if (cnpj.length !== 14) return;
    const t = setTimeout(async () => {
      setLookingUp(true);
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        if (r.ok) {
          const d = await r.json();
          setS1((p) => ({
            ...p,
            name: p.name || d.razao_social || '',
            email: p.email || d.email || '',
            phone: p.phone || d.ddd_telefone_1 || '',
            address: p.address || `${d.logradouro ?? ''}, ${d.numero ?? ''} - ${d.bairro ?? ''}, ${d.municipio ?? ''}/${d.uf ?? ''}`,
          }));
          if (d.cnae_fiscal) {
            setS2((p) => ({ ...p, cnae: String(d.cnae_fiscal), atividade: d.cnae_fiscal_descricao }));
          }
          toast.push('Dados da Receita carregados', { variant: 'success' });
        }
      } catch {}
      setLookingUp(false);
    }, 800);
    return () => clearTimeout(t);
  }, [s1.cnpj]);

  function canAdvance() {
    if (step === 1) return unmaskCnpj(s1.cnpj).length === 14 && s1.name.length > 2;
    if (step === 2) return !!s2.taxRegime;
    if (step === 3) return s3.socios.every((s) => s.nome && s.cpf);
    return true;
  }

  async function finish() {
    setCreating(true);
    setProgress([]);
    try {
      const cnpj = unmaskCnpj(s1.cnpj);
      setProgress((p) => [...p, 'Criando empresa…']);
      const { data: created } = await createCompany({
        variables: {
          input: {
            name: s1.name,
            cnpj,
            taxRegime: s2.taxRegime,
            email: s1.email || undefined,
            phone: s1.phone || undefined,
            address: s1.address || undefined,
          },
        },
      });
      const companyId = created.createCompany.id;
      const token = localStorage.getItem('aura_token') ?? '';

      setProgress((p) => [...p, 'Populando plano de contas (PCASP)…']);
      await fetch(`${API}/api/v1/chart-accounts/seed-pcasp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId }),
      });

      const year = new Date().getFullYear();
      setProgress((p) => [...p, `Gerando calendário fiscal ${year}…`]);
      await fetch(`${API}/api/v1/fiscal-calendar/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId, ano: year }),
      });

      if (s1.clienteDesde) {
        setProgress((p) => [...p, 'Marcando início do cliente (isentando meses anteriores)…']);
        await fetch(`${API}/api/v1/paineis/cliente-inicio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ companyId, data: s1.clienteDesde }),
        });
      }

      if (s4.bancos.length > 0) {
        setProgress((p) => [...p, `Conectando ${s4.bancos.length} banco(s)…`]);
        for (const bc of s4.bancos) {
          await fetch(`${API}/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              query: `mutation($input: CreateBankConnectionInput!) { createBankConnection(input: $input) { id } }`,
              variables: { input: { companyId, bankCode: bc, bankName: bc, accountType: 'Conta Corrente' } },
            }),
          });
        }
      }

      setProgress((p) => [...p, '✅ Cliente onboardado com sucesso']);
      toast.push(`${s1.name} cadastrada com plano de contas e calendário`, { variant: 'success', title: 'Onboarding concluído' });
      setTimeout(() => router.push('/companies'), 1200);
    } catch (err: any) {
      toast.push(err?.message ?? 'Erro inesperado', { variant: 'error', title: 'Falha no onboarding' });
      setProgress((p) => [...p, `❌ ${err?.message ?? 'erro'}`]);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-narrow">
      <PageHeader
        icon={<Building2 size={22} color={COLORS.acao} />}
        title="Onboarding de novo cliente"
        subtitle="5 passos rápidos. O sistema cria a empresa, popula o plano de contas e gera o calendário fiscal automaticamente."
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.id;
          const current = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-shrink-0">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors"
                style={
                  current
                    ? { background: tint(COLORS.acao, 12), borderColor: COLORS.acao, color: COLORS.acao }
                    : done
                    ? { background: tint(COLORS.ok, 10), borderColor: tint(COLORS.ok, 30), color: COLORS.ok }
                    : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--muted)' }
                }
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <div>
                  <p className="text-xs font-medium leading-none">{s.title}</p>
                  <p className="text-[10px] text-tx-muted mt-0.5">Passo {s.id}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-tx-faint" />}
            </div>
          );
        })}
      </div>

      <div className="card-aura space-y-4">
        {step === 1 && (
          <>
            <h2 className="text-[15px] font-semibold text-tx-strong">Dados da empresa</h2>
            <p className="text-xs text-tx-muted">Digite o CNPJ — o resto é puxado da Receita.</p>
            <Field label="CNPJ">
              <div className="relative">
                <input
                  autoFocus
                  value={maskCnpj(s1.cnpj)}
                  onChange={(e) => setS1({ ...s1, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="w-full input-aura font-mono"
                />
                {lookingUp && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-acao animate-spin" />
                )}
              </div>
            </Field>
            <Field label="Razão social">
              <input
                value={s1.name}
                onChange={(e) => setS1({ ...s1, name: e.target.value })}
                className="w-full input-aura"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail">
                <input
                  type="email"
                  value={s1.email}
                  onChange={(e) => setS1({ ...s1, email: e.target.value })}
                  className="w-full input-aura"
                />
              </Field>
              <Field label="Telefone">
                <input
                  value={s1.phone}
                  onChange={(e) => setS1({ ...s1, phone: e.target.value })}
                  className="w-full input-aura"
                />
              </Field>
            </div>
            <Field label="Endereço completo">
              <input
                value={s1.address}
                onChange={(e) => setS1({ ...s1, address: e.target.value })}
                className="w-full input-aura"
              />
            </Field>
            <Field label="Cliente desde (entrada no escritório)">
              <input
                type="date"
                value={s1.clienteDesde ?? ''}
                onChange={(e) => setS1({ ...s1, clienteDesde: e.target.value })}
                className="w-full input-aura"
              />
              <p className="text-xs text-tx-muted mt-1">As obrigações de competências anteriores a esta data viram “isentas” — não entram como pendência.</p>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-[15px] font-semibold text-tx-strong">Regime tributário</h2>
            <p className="text-xs text-tx-muted">Define o calendário fiscal automático que o sistema vai gerar.</p>
            <div className="grid grid-cols-2 gap-2">
              {(['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL'] as Regime[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setS2({ ...s2, taxRegime: r })}
                  className="text-left p-3 rounded-lg border transition-colors"
                  style={
                    s2.taxRegime === r
                      ? { borderColor: COLORS.acao, background: tint(COLORS.acao, 10), color: 'var(--tx-strong)' }
                      : { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--tx)' }
                  }
                >
                  <p className="text-sm font-medium">{r.replace('_', ' ')}</p>
                  <p className="text-xs text-tx-muted mt-1">{
                    r === 'MEI' ? 'Até R$ 81.000/ano · 1 funcionário'
                    : r === 'SIMPLES_NACIONAL' ? 'Até R$ 4.8M/ano · DAS unificado'
                    : r === 'LUCRO_PRESUMIDO' ? 'Até R$ 78M/ano · base presumida'
                    : 'Sem teto · base real (escrituração completa)'
                  }</p>
                </button>
              ))}
            </div>
            {s2.cnae && (
              <div className="p-3 bg-page border border-line rounded-lg">
                <p className="text-xs text-tx-muted">CNAE principal (da Receita)</p>
                <p className="text-sm text-tx font-mono">{s2.cnae}</p>
                {s2.atividade && <p className="text-xs text-tx-muted mt-1">{s2.atividade}</p>}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-[15px] font-semibold text-tx-strong">Quadro societário</h2>
            <p className="text-xs text-tx-muted">Sócios e percentuais — usado em distribuição de lucros e pro-labore.</p>
            {s3.socios.map((so, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-5">
                  <input
                    placeholder="Nome completo"
                    value={so.nome}
                    onChange={(e) => {
                      const copy = [...s3.socios];
                      copy[i] = { ...so, nome: e.target.value };
                      setS3({ socios: copy });
                    }}
                    className="w-full input-aura"
                  />
                </div>
                <div className="col-span-3">
                  <input
                    placeholder="CPF"
                    value={so.cpf}
                    onChange={(e) => {
                      const copy = [...s3.socios];
                      copy[i] = { ...so, cpf: e.target.value };
                      setS3({ socios: copy });
                    }}
                    className="w-full input-aura font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="%"
                    min="0"
                    max="100"
                    value={so.percentual}
                    onChange={(e) => {
                      const copy = [...s3.socios];
                      copy[i] = { ...so, percentual: Number(e.target.value) };
                      setS3({ socios: copy });
                    }}
                    className="w-full input-aura font-mono text-right"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  <select
                    value={so.funcao}
                    onChange={(e) => {
                      const copy = [...s3.socios];
                      copy[i] = { ...so, funcao: e.target.value };
                      setS3({ socios: copy });
                    }}
                    className="w-full input-aura"
                  >
                    <option>Administrador</option>
                    <option>Sócio</option>
                    <option>Diretor</option>
                  </select>
                  {s3.socios.length > 1 && (
                    <button
                      onClick={() => setS3({ socios: s3.socios.filter((_, j) => j !== i) })}
                      className="text-err hover:opacity-80 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={() => setS3({ socios: [...s3.socios, { nome: '', cpf: '', percentual: 0, funcao: 'Sócio' }] })}
              className="text-xs text-acao hover:opacity-80"
            >
              + Adicionar sócio
            </button>
            <p className="text-xs text-tx-faint mt-2">
              Total de participação: {s3.socios.reduce((a, b) => a + b.percentual, 0)}%
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-[15px] font-semibold text-tx-strong">Acessos e certificados</h2>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 bg-page border border-line rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={s4.hasA1}
                  onChange={(e) => setS4({ ...s4, hasA1: e.target.checked })}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm text-tx-strong">Cliente já tem certificado digital A1</p>
                  <p className="text-xs text-tx-muted mt-0.5">
                    Marca se o cliente já comprou A1 (Soluti, Certisign, etc). Você sobe o .pfx depois em Empresas → Certificado.
                  </p>
                </div>
              </label>

              <div>
                <p className="text-xs text-tx-muted mb-2">Bancos do cliente (vai criar conexões em /banking):</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: '341', name: 'Itaú' },
                    { code: '237', name: 'Bradesco' },
                    { code: '001', name: 'BB' },
                    { code: '033', name: 'Santander' },
                    { code: '104', name: 'Caixa' },
                    { code: '077', name: 'Inter' },
                    { code: '260', name: 'Nubank' },
                    { code: '208', name: 'BTG' },
                    { code: '756', name: 'Sicoob' },
                    { code: '748', name: 'Sicredi' },
                  ].map((b) => {
                    const sel = s4.bancos.includes(b.code);
                    return (
                      <button
                        key={b.code}
                        type="button"
                        onClick={() =>
                          setS4({
                            ...s4,
                            bancos: sel
                              ? s4.bancos.filter((x) => x !== b.code)
                              : [...s4.bancos, b.code],
                          })
                        }
                        className="text-left p-2 rounded-lg border text-xs transition-colors"
                        style={
                          sel
                            ? { borderColor: COLORS.acao, background: tint(COLORS.acao, 10), color: 'var(--tx-strong)' }
                            : { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--tx)' }
                        }
                      >
                        <span className="font-mono text-tx-muted mr-2">{b.code}</span>
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="text-[15px] font-semibold text-tx-strong">Revisão final</h2>
            <div className="space-y-3">
              <Review label="CNPJ" value={maskCnpj(s1.cnpj)} />
              <Review label="Razão social" value={s1.name} />
              <Review label="Regime" value={s2.taxRegime.replace('_', ' ')} />
              <Review label="Sócios" value={`${s3.socios.length} (${s3.socios.reduce((a, b) => a + b.percentual, 0)}% total)`} />
              <Review label="Certificado A1" value={s4.hasA1 ? 'Sim (subir depois)' : 'Não — adquirir'} />
              <Review label="Bancos a conectar" value={s4.bancos.length > 0 ? `${s4.bancos.length} banco(s)` : 'Nenhum'} />
            </div>

            <div className="p-4 rounded-lg mt-4" style={{ background: tint(COLORS.acao, 5), border: `1px solid ${tint(COLORS.acao, 30)}` }}>
              <p className="text-xs font-medium text-acao mb-2">O sistema vai executar:</p>
              <ul className="text-xs text-tx space-y-1">
                <li>✓ Criar registro da empresa</li>
                <li>✓ Popular plano de contas (~95 contas brasileiras PCASP)</li>
                <li>✓ Gerar calendário fiscal {new Date().getFullYear()} ({s2.taxRegime === 'MEI' ? '37' : s2.taxRegime === 'SIMPLES_NACIONAL' ? '37' : '94'} obrigações)</li>
                {s4.bancos.length > 0 && <li>✓ Cadastrar {s4.bancos.length} conexão(ões) bancária(s)</li>}
                <li className="text-tx-muted">○ Você pode subir o A1 e configurar portal do cliente depois</li>
              </ul>
            </div>

            {progress.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {progress.map((p, i) => (
                  <div key={i} className="text-xs text-tx font-mono flex items-center gap-2">
                    {i === progress.length - 1 && creating ? (
                      <Loader2 className="h-3 w-3 animate-spin text-acao" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-ok" />
                    )}
                    {p}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || creating}
          className="btn-secondary"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Voltar
        </button>
        {step < 5 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="btn-primary"
          >
            Avançar
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={creating}
            className="btn-primary"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? 'Criando…' : 'Criar cliente'}
          </button>
        )}
      </div>
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

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-tx-muted">{label}</span>
      <span className="text-tx font-medium">{value || '—'}</span>
    </div>
  );
}
