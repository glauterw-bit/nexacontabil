'use client';
import { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, AlertTriangle, ExternalLink, ChevronDown, ChevronRight,
  Sparkles, Receipt, Banknote, MessageCircle, Cloud, Mail, ShieldCheck, Building2,
  Copy, Check, HardDrive, Zap,
} from 'lucide-react';
import { PageHeader, SectionTitle, Spinner, EmptyState, COLORS, tint } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const ICONS: Record<string, any> = {
  google_drive: HardDrive,
  onvio: Building2,
  anthropic: Sparkles,
  nfeio: Receipt,
  banco_inter: Banknote,
  whatsapp: MessageCircle,
  pluggy: Cloud,
  storage: Cloud,
  email: Mail,
  cert_a1: ShieldCheck,
};

const GRUPOS: Record<number, { titulo: string; desc: string }> = {
  1: { titulo: 'Essenciais pra operação', desc: 'Ativam a Esteira Fiscal, a IA e os envios automáticos ao cliente' },
  2: { titulo: 'Fiscal & Cobrança', desc: 'Emissão de notas, boletos reais e ponte com o Domínio' },
  3: { titulo: 'Avançadas', desc: 'Conciliação bancária e armazenamento legal' },
};

interface Integration {
  key: string;
  name: string;
  status: 'configured' | 'missing' | 'partial';
  required: boolean;
  prioridade?: 1 | 2 | 3;
  usadoEm?: string;
  helps: string[];
  signupUrl?: string;
  setupSteps: string[];
}

export default function IntegracoesPage() {
  const [data, setData] = useState<{ integrations: Integration[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/integrations/status`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) {
    return (
      <div className="page">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <EmptyState icon={<Cloud size={40} />} title="Falha ao carregar status" sub="Tente novamente em alguns segundos." />
      </div>
    );
  }

  const pct = data.summary.total > 0 ? Math.round((data.summary.configured / data.summary.total) * 100) : 0;

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Sparkles size={22} color={COLORS.acao} />}
        title="Integrações"
        subtitle="O NexaContábil funciona sem nenhuma destas APIs (modo demo); cada uma adicionada desbloqueia uma capacidade real — configure pelo Railway → backend → Variables."
      />

      {/* Progress bar */}
      <div className="card-aura">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[13px] font-medium text-tx-strong">
              Progresso de configuração: {data.summary.configured} de {data.summary.total}
            </p>
            <p className="text-xs text-tx-muted mt-0.5">{pct}% do potencial ativado</p>
          </div>
          <span className="num text-2xl font-bold text-acao">{pct}%</span>
        </div>
        <div className="h-2 bg-inset rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: COLORS.acao }}
          />
        </div>
      </div>

      {/* List agrupada por prioridade */}
      {[1, 2, 3].map((grupo) => {
        const items = data.integrations.filter((i) => (i.prioridade ?? 2) === grupo);
        if (items.length === 0) return null;
        const g = GRUPOS[grupo];
        return (
        <div key={grupo} className="space-y-2">
          <SectionTitle>
            {grupo === 1 ? <Zap className="h-4 w-4 text-tx-muted" /> : grupo === 2 ? <Receipt className="h-4 w-4 text-tx-muted" /> : <Cloud className="h-4 w-4 text-tx-muted" />}
            {g.titulo}
            <span className="text-xs text-tx-muted font-normal">· {g.desc}</span>
          </SectionTitle>
        {items.map((it) => {
          const Icon = ICONS[it.key] || Cloud;
          const isExpanded = expanded === it.key;
          return (
            <div
              key={it.key}
              className="card-aura !p-0 transition-colors"
              style={
                it.status === 'configured'
                  ? { borderColor: tint(COLORS.ok, 30), background: tint(COLORS.ok, 5) }
                  : it.status === 'partial'
                  ? { borderColor: tint(COLORS.atencao, 30), background: tint(COLORS.atencao, 5) }
                  : undefined
              }
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : it.key)}
                className="w-full p-4 flex items-center gap-4 text-left"
              >
                <div className="flex-shrink-0">
                  {it.status === 'configured' ? (
                    <CheckCircle2 className="h-5 w-5 text-ok" />
                  ) : it.status === 'partial' ? (
                    <AlertTriangle className="h-5 w-5 text-warn" />
                  ) : (
                    <Circle className="h-5 w-5 text-tx-faint" />
                  )}
                </div>
                <Icon className="h-4 w-4 text-tx-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-tx-strong">{it.name}</p>
                    {it.required && (
                      <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-err rounded"
                        style={{ background: tint(COLORS.erro, 12), border: `1px solid ${tint(COLORS.erro, 30)}` }}>
                        Obrigatório por cliente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-tx-muted mt-0.5 truncate">{it.helps[0]}</p>
                  {it.usadoEm && (
                    <p className="text-[11px] text-tx-muted mt-0.5 truncate">Usado em: {it.usadoEm}</p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-tx-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-tx-muted" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-line space-y-4">
                  {/* O que isso desbloqueia */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-tx-muted mb-1.5">
                      O que essa integração desbloqueia
                    </p>
                    <ul className="space-y-1">
                      {it.helps.map((h, i) => (
                        <li key={i} className="text-xs text-tx flex gap-2">
                          <span className="text-acao">·</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Passos */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-tx-muted mb-1.5">
                      Passo a passo
                    </p>
                    <ol className="space-y-2">
                      {it.setupSteps.map((s, i) => (
                        <li key={i} className="text-xs text-tx flex gap-2.5">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full text-acao text-[10px] flex items-center justify-center font-mono"
                            style={{ background: tint(COLORS.acao, 12), border: `1px solid ${tint(COLORS.acao, 30)}` }}>
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">
                            {s.split(/([A-Z_]{4,})/g).map((part, j) =>
                              /^[A-Z_]{4,}$/.test(part) ? (
                                <button
                                  key={j}
                                  onClick={() => copy(part)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-inset border border-line hover:border-[var(--acao)] text-acao font-mono rounded text-[10px] transition-colors"
                                  title="Copiar"
                                >
                                  {part}
                                  {copied === part ? (
                                    <Check className="h-2.5 w-2.5 text-ok" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </button>
                              ) : (
                                part
                              )
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {it.signupUrl && (
                      <a
                        href={it.signupUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary text-xs"
                      >
                        Abrir provedor
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <a
                      href="https://railway.com/project/13950cf7-4eb4-481c-9496-d8cb64fdced6/service/8189c609-e8a5-4a8c-b42e-695c1712e62c/variables"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary text-xs"
                    >
                      Variáveis do backend (Railway)
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
        );
      })}

      {/* Help */}
      <div className="card-aura">
        <div className="flex gap-3">
          <Building2 className="h-4 w-4 text-tx-muted flex-shrink-0 mt-0.5" />
          <div className="text-xs text-tx-muted leading-relaxed">
            <p className="font-medium text-tx-strong mb-1">Funciona sem nenhuma integração?</p>
            <p>
              Sim — o sistema opera em modo demo (cálculos, plano de contas, calendário fiscal,
              cadastros, lançamentos manuais, SPED gerado em arquivo). As integrações desbloqueiam
              automação. Comece adicionando a chave do Claude (US$ 5 de crédito basta para semanas
              de uso) e depois NFe.io quando o primeiro cliente assinar o contrato.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
