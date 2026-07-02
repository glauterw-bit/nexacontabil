'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Cloud, Check, Loader2, Trash2, FolderOpen, Mail, Calendar, Plus, ExternalLink, Copy,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Conn {
  id: string; provider: string; label: string; accountEmail: string;
  scope: string; rootFolderId?: string; lastUsedAt?: string; createdAt: string;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const PROVIDER_INFO: Record<string, { name: string; color: string; icon: string }> = {
  google_drive: { name: 'Google Drive', color: 'text-info', icon: '🔵' },
  microsoft_onedrive: { name: 'Microsoft OneDrive', color: 'text-cyan-400', icon: '🟦' },
};

export default function DriveConectadoPage() {
  const toast = useToast();
  const params = useSearchParams();
  const [conns, setConns] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelGoogle, setLabelGoogle] = useState('Drive do Escritório');
  const [labelMicrosoft, setLabelMicrosoft] = useState('OneDrive do Escritório');
  const [folderGoogle, setFolderGoogle] = useState('');
  const [folderMicrosoft, setFolderMicrosoft] = useState('');
  const [sa, setSa] = useState<{ configured: boolean; email: string | null }>({ configured: false, email: null });
  const [saFolder, setSaFolder] = useState('');
  const [saLabel, setSaLabel] = useState('Pasta do Escritório');
  const [saBusy, setSaBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/cloud/connections`, { headers: authHeaders() });
      const d = await r.json();
      setConns(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }

  async function loadSa() {
    try {
      const r = await fetch(`${API}/api/v1/cloud/google/service-account`, { headers: authHeaders() });
      if (r.ok) setSa(await r.json());
    } catch { /* noop */ }
  }

  async function connectServiceAccount() {
    if (!saFolder.trim()) { toast.push('Cole o ID da pasta do Drive', { variant: 'error' }); return; }
    setSaBusy(true);
    try {
      const r = await fetch(`${API}/api/v1/cloud/google/service-account/connect`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: saLabel, folderId: saFolder.trim() }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao conectar');
      toast.push('Pasta conectada! A IA já pode ler os documentos.', { variant: 'success' });
      setSaFolder('');
      load();
    } catch (e: any) {
      toast.push(e.message, { variant: 'error', title: 'Não conectou' });
    } finally { setSaBusy(false); }
  }

  useEffect(() => { load(); loadSa(); }, []);

  useEffect(() => {
    if (params.get('connected')) {
      toast.push(`Drive ${params.get('connected')} conectado com sucesso!`, { variant: 'success' });
      load();
    }
    if (params.get('error')) {
      toast.push(decodeURIComponent(params.get('error')!), { variant: 'error', title: 'Falha ao conectar' });
    }
  }, []);

  async function startConnect(provider: 'google' | 'microsoft') {
    const label = provider === 'google' ? labelGoogle : labelMicrosoft;
    const folder = provider === 'google' ? folderGoogle : folderMicrosoft;
    const qs = new URLSearchParams({ label, ...(folder ? { rootFolderId: folder } : {}) });
    const r = await fetch(`${API}/api/v1/cloud/${provider}/authorize?${qs}`, { headers: authHeaders() });
    const d = await r.json();
    if (d.url) {
      window.location.href = d.url;
    } else {
      toast.push('OAuth não configurado. Adicione as credenciais no Railway.', { variant: 'error' });
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revogar essa conexão?')) return;
    await fetch(`${API}/api/v1/cloud/connections/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    toast.push('Conexão revogada', { variant: 'success' });
    load();
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="h-5 w-5 text-acao" />
          <h1 className="text-xl font-semibold text-tx-strong">Drives Conectados</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-acao border border-indigo-500/30 rounded">Novo</span>
        </div>
        <p className="text-sm text-tx-muted max-w-2xl">
          Conecte o Google Drive e/ou OneDrive do escritório. A IA do NexaContábil poderá buscar, analisar e gerar relatórios a partir de qualquer documento dessas pastas.
        </p>
      </div>

      {/* Conta de Serviço — caminho recomendado (sem login/senha) */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="text-sm font-semibold text-tx-strong">Conta de Serviço — recomendado</h2>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-emerald-500/15 text-ok border border-emerald-500/30 rounded">Sem senha</span>
        </div>
        <p className="text-xs text-tx-muted">
          O jeito mais simples e seguro: você compartilha a pasta do Drive com o e-mail do robô abaixo
          (permissão Leitor) e a IA lê todos os documentos dela. Nenhuma senha, nenhuma tela de login.
        </p>

        {!sa.configured ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-warn leading-relaxed">
            <b>Falta 1 passo no Railway.</b> Crie uma Conta de Serviço no Google Cloud, baixe o JSON e cole no
            Railway → backend → Variables como <code className="px-1 bg-black/30 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code>.
            Assim que salvar, o e-mail do robô aparece aqui.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-inset p-2.5">
              <span className="text-[11px] text-tx-muted flex-shrink-0">Compartilhe a pasta com:</span>
              <code className="text-xs text-ok font-mono truncate flex-1">{sa.email}</code>
              <button onClick={() => { navigator.clipboard.writeText(sa.email!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="text-tx-muted hover:text-tx-strong flex-shrink-0">
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={saLabel} onChange={(e) => setSaLabel(e.target.value)} placeholder="Apelido"
                className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none" />
              <input value={saFolder} onChange={(e) => setSaFolder(e.target.value)} placeholder="ID da pasta compartilhada"
                className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none font-mono" />
            </div>
            <button onClick={connectServiceAccount} disabled={saBusy}
              className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded inline-flex items-center justify-center gap-2">
              {saBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Conectar pasta
            </button>
            <p className="text-[11px] text-tx-muted">
              O ID da pasta está na URL do Drive: drive.google.com/drive/folders/<b className="text-tx">ESTE_TRECHO</b>
            </p>
          </>
        )}
      </div>

      {/* Connect cards — OAuth (alternativa) */}
      <p className="text-xs text-tx-muted -mb-2">Ou conecte por login (OAuth):</p>
      <div className="grid md:grid-cols-2 gap-3">
        {/* Google */}
        <div className="rounded-xl border border-line bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔵</span>
            <h2 className="text-sm font-medium text-tx-strong">Google Drive</h2>
          </div>
          <input
            value={labelGoogle}
            onChange={(e) => setLabelGoogle(e.target.value)}
            placeholder="Apelido (ex: Drive Principal)"
            className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none"
          />
          <input
            value={folderGoogle}
            onChange={(e) => setFolderGoogle(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none font-mono"
          />
          <button
            onClick={() => startConnect('google')}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar Google Drive
          </button>
        </div>

        {/* Microsoft */}
        <div className="rounded-xl border border-line bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🟦</span>
            <h2 className="text-sm font-medium text-tx-strong">Microsoft OneDrive</h2>
          </div>
          <input
            value={labelMicrosoft}
            onChange={(e) => setLabelMicrosoft(e.target.value)}
            placeholder="Apelido (ex: OneDrive Filial)"
            className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none"
          />
          <input
            value={folderMicrosoft}
            onChange={(e) => setFolderMicrosoft(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="w-full px-3 py-1.5 bg-inset border border-line rounded text-xs text-tx-strong outline-none font-mono"
          />
          <button
            onClick={() => startConnect('microsoft')}
            className="w-full px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar OneDrive
          </button>
        </div>
      </div>

      {/* Lista de conexões */}
      <div>
        <h2 className="text-sm font-medium text-tx-strong mb-2">Conexões ativas</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-tx-muted text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : conns.length === 0 ? (
          <div className="rounded-xl border border-line bg-card p-8 text-center">
            <FolderOpen className="h-8 w-8 text-tx-faint mx-auto mb-2" />
            <p className="text-sm text-tx-muted">Nenhuma conexão ativa</p>
            <p className="text-xs text-tx-muted mt-1">Use os botões acima para conectar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conns.map((c) => {
              const info = PROVIDER_INFO[c.provider];
              return (
                <div key={c.id} className="rounded-lg border border-line bg-card p-3 flex items-center gap-3">
                  <span className="text-2xl">{info?.icon ?? '☁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-tx-strong">{c.label}</p>
                      <span className="px-1.5 py-0.5 text-[9px] uppercase bg-emerald-500/15 text-ok border border-emerald-500/30 rounded">
                        {c.scope}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-tx-muted mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.accountEmail}
                      </span>
                      {c.lastUsedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> usado em {new Date(c.lastUsedAt).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(c.id)}
                    className="text-tx-muted hover:text-err p-1"
                    title="Revogar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs text-warn leading-relaxed">
          <strong>Pré-requisito</strong>: as integrações dependem de variáveis no Railway:{' '}
          <code className="text-warn">GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,{' '}
          <code className="text-warn">MICROSOFT_CLIENT_ID</code>, <code>MICROSOFT_CLIENT_SECRET</code>,{' '}
          <code>MICROSOFT_TENANT_ID</code>. Veja{' '}
          <a href="https://github.com/glauterw-bit/nexacontabil/blob/master/docs/CLOUD_SETUP.md" target="_blank" className="underline">
            docs/CLOUD_SETUP.md
          </a>{' '}
          para o passo-a-passo no Google Cloud Console e Azure Portal.
        </p>
      </div>
    </div>
  );
}
