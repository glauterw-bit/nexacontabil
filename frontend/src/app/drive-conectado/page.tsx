'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Cloud, Check, Loader2, Trash2, FolderOpen, Mail, Calendar, Plus, ExternalLink,
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
  google_drive: { name: 'Google Drive', color: 'text-blue-400', icon: '🔵' },
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

  useEffect(() => { load(); }, []);

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
          <Cloud className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Drives Conectados</h1>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">Novo</span>
        </div>
        <p className="text-sm text-gray-400 max-w-2xl">
          Conecte o Google Drive e/ou OneDrive do escritório. A IA do NexaContábil poderá buscar, analisar e gerar relatórios a partir de qualquer documento dessas pastas.
        </p>
      </div>

      {/* Connect cards */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Google */}
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔵</span>
            <h2 className="text-sm font-medium text-white">Google Drive</h2>
          </div>
          <input
            value={labelGoogle}
            onChange={(e) => setLabelGoogle(e.target.value)}
            placeholder="Apelido (ex: Drive Principal)"
            className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none"
          />
          <input
            value={folderGoogle}
            onChange={(e) => setFolderGoogle(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none font-mono"
          />
          <button
            onClick={() => startConnect('google')}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded inline-flex items-center justify-center gap-2"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar Google Drive
          </button>
        </div>

        {/* Microsoft */}
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🟦</span>
            <h2 className="text-sm font-medium text-white">Microsoft OneDrive</h2>
          </div>
          <input
            value={labelMicrosoft}
            onChange={(e) => setLabelMicrosoft(e.target.value)}
            placeholder="Apelido (ex: OneDrive Filial)"
            className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none"
          />
          <input
            value={folderMicrosoft}
            onChange={(e) => setFolderMicrosoft(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="w-full px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none font-mono"
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
        <h2 className="text-sm font-medium text-white mb-2">Conexões ativas</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : conns.length === 0 ? (
          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-8 text-center">
            <FolderOpen className="h-8 w-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhuma conexão ativa</p>
            <p className="text-xs text-gray-500 mt-1">Use os botões acima para conectar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conns.map((c) => {
              const info = PROVIDER_INFO[c.provider];
              return (
                <div key={c.id} className="rounded-lg border border-[#1e2740] bg-[#161b2e] p-3 flex items-center gap-3">
                  <span className="text-2xl">{info?.icon ?? '☁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{c.label}</p>
                      <span className="px-1.5 py-0.5 text-[9px] uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded">
                        {c.scope}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
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
                    className="text-gray-500 hover:text-red-400 p-1"
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
        <p className="text-xs text-amber-300 leading-relaxed">
          <strong>Pré-requisito</strong>: as integrações dependem de variáveis no Railway:{' '}
          <code className="text-amber-200">GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,{' '}
          <code className="text-amber-200">MICROSOFT_CLIENT_ID</code>, <code>MICROSOFT_CLIENT_SECRET</code>,{' '}
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
