'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { Building2, FileText, ArrowRight, X, Sparkles, Calendar, BookOpen } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';

const GET_COMPANIES_COUNT = gql`
  query GetCompaniesCount {
    companies { id }
  }
`;

const STORAGE_KEY = 'nexa_onboarding_dismissed';

export function WelcomeOnboarding() {
  const router = useRouter();
  const { selectedCompany } = useCompany();
  const [open, setOpen] = useState(false);
  const { data } = useQuery(GET_COMPANIES_COUNT);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;
    // Show only if 0 companies (likely first run)
    if (data && (data.companies?.length ?? 0) === 0) {
      setOpen(true);
    }
  }, [data]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(13,17,25,0.45)] backdrop-blur-sm p-4" onClick={dismiss}>
      <div
        className="w-full max-w-lg bg-card border border-line rounded-xl shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-6 pb-4">
          <button onClick={dismiss} className="absolute top-4 right-4 text-tx-muted hover:text-tx-strong">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-9 w-9 rounded-xl bg-[color-mix(in_srgb,var(--acao)_12%,transparent)] border border-[color-mix(in_srgb,var(--acao)_25%,transparent)] flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-acao" />
            </div>
            <div>
              <p className="text-xs text-acao font-medium">Bem-vindo</p>
              <h2 className="text-base font-semibold text-tx-strong">Vamos configurar o escritório em 3 passos</h2>
            </div>
          </div>
          <p className="text-xs text-tx-muted mt-2">
            Em ~5 minutos você tem um cliente operando com plano de contas, calendário fiscal e dashboard ativos.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          <Step
            n={1}
            icon={Building2}
            title="Cadastre o primeiro cliente"
            description="CNPJ, razão social, regime tributário"
            cta="Ir para Empresas"
            onClick={() => {
              dismiss();
              router.push('/companies');
            }}
          />
          <Step
            n={2}
            icon={BookOpen}
            title="Importe o plano de contas padrão"
            description="~85 contas brasileiras (PCASP) prontas para usar"
            cta="Quando tiver cliente, na tela de empresa"
            disabled={!selectedCompany}
            onClick={() => {
              dismiss();
              router.push('/companies');
            }}
          />
          <Step
            n={3}
            icon={Calendar}
            title="Gere o calendário fiscal do ano"
            description="DAS, DARF, FGTS, eSocial, DCTFWeb, ECD, ECF — automático por regime"
            cta="Abrir Agenda Fiscal"
            disabled={!selectedCompany}
            onClick={() => {
              dismiss();
              router.push('/agenda');
            }}
          />
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center justify-between">
          <button onClick={dismiss} className="text-xs text-tx-muted hover:text-tx">
            Pular tutorial
          </button>
          <button
            onClick={() => {
              dismiss();
              router.push('/companies');
            }}
            className="btn-primary text-xs gap-1.5"
          >
            Começar agora <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  description,
  cta,
  onClick,
  disabled,
}: {
  n: number;
  icon: any;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all ${
        disabled
          ? 'border-line opacity-60 cursor-not-allowed'
          : 'border-line hover:border-[color-mix(in_srgb,var(--acao)_50%,transparent)] hover:bg-inset'
      }`}
    >
      <div className="h-7 w-7 rounded-full bg-inset border border-line flex items-center justify-center text-xs text-acao font-mono flex-shrink-0">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-acao" />
          <p className="text-sm font-medium text-tx-strong">{title}</p>
        </div>
        <p className="text-xs text-tx-muted mt-0.5">{description}</p>
        <p className="text-xs text-acao mt-1.5">{cta} →</p>
      </div>
    </button>
  );
}
