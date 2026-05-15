'use client';
import { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, AlertTriangle, ExternalLink, ChevronDown, ChevronRight,
  Sparkles, Receipt, Banknote, MessageCircle, Cloud, Mail, ShieldCheck, Building2,
  Copy, Check, Loader2,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

const ICONS: Record<string, any> = {
  anthropic: Sparkles,
  nfeio: Receipt,
  banco_inter: Banknote,
  whatsapp: MessageCircle,
  pluggy: Cloud,
  storage: Cloud,
  email: Mail,
  cert_a1: ShieldCheck,
};

interface Integration {
  key: string;
  name: string;
  status: 'configured' | 'missing' | 'partial';
  required: boolean;
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
      <div className="p-8 flex items-center gap-3 text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando integrações…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-red-400 text-sm">
        Falha ao carregar status. Tente novamente em alguns segundos.
      </div>
    );
  }

  const pct = data.summary.total > 0 ? Math.round((data.summary.configured / data.summary.total) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Integrações</h1>
        </div>
        <p className="text-sm text-gray-400 max-w-2xl">
          O NexaContábil funciona sem nenhuma destas APIs externas (modo demo). Cada uma adicionada
          desbloqueia uma capacidade real. Configure pelo Railway → backend → Variables.
        </p>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-white">
              Progresso de configuração: {data.summary.configured} de {data.summary.total}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{pct}% do potencial ativado</p>
          </div>
          <span className="text-2xl font-bold text-indigo-400 font-mono">{pct}%</span>
        </div>
        <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {data.integrations.map((it) => {
          const Icon = ICONS[it.key] || Cloud;
          const isExpanded = expanded === it.key;
          return (
            <div
              key={it.key}
              className={`rounded-xl border ${
                it.status === 'configured'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : it.status === 'partial'
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-[#1e2740] bg-[#161b2e]'
              } transition-colors`}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : it.key)}
                className="w-full p-4 flex items-center gap-4 text-left"
              >
                <div className="flex-shrink-0">
                  {it.status === 'configured' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : it.status === 'partial' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-600" />
                  )}
                </div>
                <Icon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{it.name}</p>
                    {it.required && (
                      <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/30 rounded">
                        Obrigatório por cliente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{it.helps[0]}</p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-[#1e2740] space-y-4">
                  {/* O que isso desbloqueia */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                      O que essa integração desbloqueia
                    </p>
                    <ul className="space-y-1">
                      {it.helps.map((h, i) => (
                        <li key={i} className="text-xs text-gray-300 flex gap-2">
                          <span className="text-indigo-400">·</span>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Passos */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
                      Passo a passo
                    </p>
                    <ol className="space-y-2">
                      {it.setupSteps.map((s, i) => (
                        <li key={i} className="text-xs text-gray-300 flex gap-2.5">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] flex items-center justify-center font-mono">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">
                            {s.split(/([A-Z_]{4,})/g).map((part, j) =>
                              /^[A-Z_]{4,}$/.test(part) ? (
                                <button
                                  key={j}
                                  onClick={() => copy(part)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-[#0f1117] border border-[#2a3550] hover:border-indigo-500/40 text-indigo-300 font-mono rounded text-[10px] transition-colors"
                                  title="Copiar"
                                >
                                  {part}
                                  {copied === part ? (
                                    <Check className="h-2.5 w-2.5 text-emerald-400" />
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                      >
                        Abrir provedor
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <a
                      href="https://railway.com/project/13950cf7-4eb4-481c-9496-d8cb64fdced6/service/8189c609-e8a5-4a8c-b42e-695c1712e62c/variables"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#1e2740] hover:bg-[#2a3550] text-white border border-[#2a3550] rounded-lg transition-colors"
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

      {/* Help */}
      <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
        <div className="flex gap-3">
          <Building2 className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 leading-relaxed">
            <p className="font-medium text-white mb-1">Funciona sem nenhuma integração?</p>
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
