'use client';
import { useEffect, useState } from 'react';
import {
  Cloud, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Plug, Unplug,
  Receipt, CreditCard, Users, RefreshCw, ChevronRight, Info,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface OnvioStatus {
  connected: boolean;
  onvioEmail?: string | null;
  onvioTenantId?: string | null;
  scopes?: string;
  modulos?: string | null;
  expiresAt?: string;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  syncStats?: any;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function OnvioPage() {
  const toast = useToast();
  const [status, setStatus] = useState<OnvioStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/onvio/status`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus(await r.json());
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro ao carregar status', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Detecta retorno do OAuth
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('connected');
    const error = url.searchParams.get('error');
    if (connected === 'onvio') {
      toast.push('Conectado ao Onvio com sucesso!', { variant: 'success' });
      window.history.replaceState({}, '', '/onvio');
    } else if (error) {
      toast.push(`Falha ao conectar: ${error}`, { variant: 'error' });
      window.history.replaceState({}, '', '/onvio');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    setConnecting(true);
    try {
      const r = await fetch(`${API}/api/v1/onvio/authorize?returnTo=/onvio`, { headers: authHeaders() });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${r.status}`);
      }
      const { url } = await r.json();
      window.location.href = url;
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro ao iniciar conexão', { variant: 'error' });
      setConnecting(false);
    }
  }

  async function desconectar() {
    if (!confirm('Desconectar a conta Onvio? Envios automáticos vão parar.')) return;
    try {
      const r = await fetch(`${API}/api/v1/onvio/disconnect`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.push('Onvio desconectado', { variant: 'success' });
      load();
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="h-5 w-5 text-acao" />
          <h1 className="text-xl font-semibold text-tx-strong">Integração Onvio</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-acao border border-indigo-500/30 rounded">
            Thomson Reuters
          </span>
        </div>
        <p className="text-sm text-tx-muted">
          Envio automático de NF, baixas de parcelas e rubricas de folha para o Domínio via Onvio.
        </p>
      </div>

      {loading && !status ? (
        <div className="text-center py-20 text-sm text-tx-muted flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando status…
        </div>
      ) : status?.connected ? (
        <ConnectedView status={status} onDisconnect={desconectar} onRefresh={load} />
      ) : (
        <NotConnectedView onConnect={conectar} connecting={connecting} />
      )}
    </div>
  );
}

function NotConnectedView({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  return (
    <>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
        <AlertTriangle className="h-4 w-4 text-warn flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-tx-strong">Onvio ainda não conectado</p>
          <p className="text-xs text-tx-muted mt-1">
            Para integrar com o Domínio do escritório, conecte sua conta Onvio. As funcionalidades
            disponíveis dependem do que está habilitado no painel Onvio do escritório (ex: "Nota fiscal
            e Baixa de parcelas — Envio e consulta", "Lançamentos de Rubricas — Envio").
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card p-5">
        <h2 className="text-sm font-medium text-tx-strong mb-3">Pré-requisitos</h2>
        <ol className="space-y-2 text-sm text-tx">
          <li className="flex gap-2">
            <span className="text-acao font-mono text-xs">1.</span>
            Ter conta ativa no <span className="font-medium text-tx-strong">Onvio</span> (Thomson Reuters).
          </li>
          <li className="flex gap-2">
            <span className="text-acao font-mono text-xs">2.</span>
            Solicitar credenciais OAuth no Portal Onvio → "Plataforma de Integração" — variáveis
            <code className="mx-1 px-1.5 py-0.5 bg-inset rounded text-xs">ONVIO_CLIENT_ID</code>
            e <code className="mx-1 px-1.5 py-0.5 bg-inset rounded text-xs">ONVIO_CLIENT_SECRET</code>
            configuradas no servidor.
          </li>
          <li className="flex gap-2">
            <span className="text-acao font-mono text-xs">3.</span>
            Habilitar no painel Onvio as funcionalidades que deseja usar (NF/Baixas/Rubricas).
          </li>
        </ol>
      </div>

      <button
        onClick={onConnect}
        disabled={connecting}
        className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-medium inline-flex items-center gap-2 disabled:opacity-50"
      >
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        Conectar com Onvio
        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
      </button>
    </>
  );
}

function ConnectedView({ status, onDisconnect, onRefresh }: {
  status: OnvioStatus; onDisconnect: () => void; onRefresh: () => void;
}) {
  const expira = status.expiresAt ? new Date(status.expiresAt) : null;
  const expirado = expira ? expira.getTime() < Date.now() : false;

  return (
    <>
      <div className={`rounded-xl border p-4 flex gap-3 ${
        expirado ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
      }`}>
        <CheckCircle2 className={`h-5 w-5 flex-shrink-0 mt-0.5 ${expirado ? 'text-warn' : 'text-ok'}`} />
        <div className="flex-1">
          <p className="text-sm font-medium text-tx-strong">Onvio conectado</p>
          <p className="text-xs text-tx-muted mt-0.5">
            {status.onvioEmail ?? 'conta sem e-mail identificado'}
            {status.onvioTenantId && ` · tenant ${status.onvioTenantId}`}
          </p>
          {expira && (
            <p className="text-xs text-tx-muted mt-1">
              Token {expirado ? 'expirou' : `expira em`} {expira.toLocaleString('pt-BR')}
              {!expirado && ' (será renovado automaticamente)'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="px-2.5 py-1.5 text-xs bg-inset hover:bg-card border border-line text-tx-strong rounded inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
          <button
            onClick={onDisconnect}
            className="px-2.5 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-err border border-rose-500/30 rounded inline-flex items-center gap-1.5"
          >
            <Unplug className="h-3.5 w-3.5" /> Desconectar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard
          icon={Receipt}
          title="Nota Fiscal"
          desc="Envia NF emitida → Domínio importa. Consulta status."
          endpoint="POST /api/v1/onvio/notas-fiscais/:id/enviar"
        />
        <FeatureCard
          icon={CreditCard}
          title="Baixa de Parcelas"
          desc="Envia baixas de boletos pagos → Domínio atualiza Contas a Receber."
          endpoint="POST /api/v1/onvio/baixas-parcelas/:id/enviar"
        />
        <FeatureCard
          icon={Users}
          title="Rubricas Folha"
          desc="Envia proventos/descontos do holerite → Domínio Folha."
          endpoint="POST /api/v1/onvio/rubricas/:id/enviar"
        />
      </div>

      {status.scopes && (
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-tx-muted font-medium mb-2">Scopes autorizados</p>
          <div className="flex flex-wrap gap-1.5">
            {status.scopes.split(/\s+/).filter(Boolean).map(s => (
              <span key={s} className="px-2 py-0.5 text-xs bg-indigo-500/15 text-acao border border-indigo-500/30 rounded">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {status.lastSyncAt && (
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-tx-muted font-medium mb-2">Último envio</p>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-tx-strong">{new Date(status.lastSyncAt).toLocaleString('pt-BR')}</p>
              {status.syncStats && (
                <p className="text-xs text-tx-muted mt-0.5">
                  {Object.entries(status.syncStats).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </p>
              )}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              status.lastSyncStatus === 'ok' ? 'bg-emerald-400/10 text-ok'
              : status.lastSyncStatus === 'partial' ? 'bg-amber-400/10 text-warn'
              : 'bg-rose-400/10 text-err'
            }`}>
              {status.lastSyncStatus}
            </span>
          </div>
          {status.lastSyncError && (
            <p className="text-xs text-err mt-2 font-mono">{status.lastSyncError}</p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex gap-2">
        <Info className="h-4 w-4 text-acao flex-shrink-0 mt-0.5" />
        <p className="text-xs text-tx leading-relaxed">
          O envio automático acontece quando NF/boletos/holerites são criados ou marcados como pagos.
          Também é possível disparar manualmente em cada tela. O Domínio é a fonte oficial — Onvio é o
          canal de entrega.
        </p>
      </div>
    </>
  );
}

function FeatureCard({ icon: Icon, title, desc, endpoint }: any) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 hover:border-indigo-500/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-acao" />
        <h3 className="text-sm font-medium text-tx-strong">{title}</h3>
      </div>
      <p className="text-xs text-tx-muted leading-relaxed mb-2">{desc}</p>
      <code className="text-[10px] text-tx-muted font-mono break-all">{endpoint}</code>
    </div>
  );
}
