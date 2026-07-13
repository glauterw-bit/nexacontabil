'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Cloud, Check, Loader2, Trash2, FolderOpen, Mail, Calendar, Plus, ExternalLink, Copy,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, SectionTitle, Spinner, EmptyState, COLORS, tint } from '@/components/ui/kit';

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

  // resync completo (puxa todo e qualquer arquivo)
  const [resync, setResync] = useState<{ rodando: boolean; processados: number; restantes: number; novos: number } | null>(null);
  const [reparse, setReparse] = useState<{ rodando: boolean; corrigidos: number; restantes: number } | null>(null);
  const pararRef = (typeof window !== 'undefined') ? (window as any) : {};

  async function corrigirDatas() {
    if (reparse?.rodando) { pararRef.__pararReparse = true; return; }
    pararRef.__pararReparse = false;
    let corrigidos = 0, restantes = 1;
    setReparse({ rodando: true, corrigidos: 0, restantes: 0 });
    try {
      while (restantes > 0 && !pararRef.__pararReparse) {
        const r = await fetch(`${API}/api/v1/analise-cliente/reparsear-sem-data`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ limit: 400 }),
        });
        if (!r.ok) { toast.push('Falha ao corrigir datas.', { variant: 'error' }); break; }
        const d = await r.json();
        corrigidos += d.corrigidos ?? 0; restantes = d.restantes ?? 0;
        setReparse({ rodando: restantes > 0 && !pararRef.__pararReparse, corrigidos, restantes });
      }
      toast.push(`${corrigidos} documento(s) tiveram a data corrigida.`, { variant: 'success' });
    } finally { setReparse((s) => s ? { ...s, rodando: false } : null); }
  }

  async function puxarTudo() {
    if (resync?.rodando) { pararRef.__pararResync = true; return; }
    pararRef.__pararResync = false;
    const desde = new Date().toISOString();
    let processados = 0, novos = 0, restantes = 1;
    setResync({ rodando: true, processados: 0, restantes: 0, novos: 0 });
    try {
      // chama em loop até restantes = 0 (ou o usuário parar)
      while (restantes > 0 && !pararRef.__pararResync) {
        const r = await fetch(`${API}/api/v1/analise-cliente/resync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ desde, limit: 6 }),
        });
        if (!r.ok) { toast.push('Falha no resync — verifique a conexão do drive.', { variant: 'error' }); break; }
        const d = await r.json();
        processados += d.processados ?? 0;
        novos += d.novosDocs ?? 0;
        restantes = d.restantes ?? 0;
        setResync({ rodando: restantes > 0 && !pararRef.__pararResync, processados, restantes, novos });
      }
      toast.push(`Resync ${pararRef.__pararResync ? 'pausado' : 'concluído'}: ${novos} arquivo(s) novo(s) em ${processados} clientes.`, { variant: 'success' });
    } finally {
      setResync((s) => s ? { ...s, rodando: false } : null);
    }
  }

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
    <div className="page-narrow space-y-6">
      <PageHeader
        icon={<Cloud size={22} color={COLORS.acao} />}
        title="Drives Conectados"
        subtitle="Conecte o Google Drive e/ou OneDrive do escritório. A IA do NexaContábil poderá buscar, analisar e gerar relatórios a partir de qualquer documento dessas pastas."
        action={
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-acao rounded"
            style={{ background: tint(COLORS.acao, 12), border: `1px solid ${tint(COLORS.acao, 30)}` }}>Novo</span>
        }
      />

      {/* Resync completo — puxa TODO e QUALQUER arquivo do drive */}
      <div className="card-aura space-y-2" style={{ borderColor: tint(COLORS.acao, 30), background: tint(COLORS.acao, 5) }}>
        <div className="flex items-center gap-2">
          <FolderOpen size={16} style={{ color: COLORS.acao }} />
          <h2 className="text-[15px] font-semibold text-tx-strong">Puxar todos os arquivos do drive</h2>
        </div>
        <p className="text-xs text-tx-muted">
          Varredura completa e sem teto: captura <b className="text-tx">qualquer arquivo</b> (XML, PDF, recibos, planilhas, imagens)
          de todas as pastas dos clientes. Roda em lotes — pode levar um tempo em carteiras grandes; pode pausar quando quiser.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={puxarTudo} className={resync?.rodando ? 'btn-secondary' : 'btn-primary'}>
            {resync?.rodando ? <><Loader2 className="h-4 w-4 animate-spin" /> Pausar</> : <><FolderOpen className="h-4 w-4" /> Puxar tudo agora</>}
          </button>
          {resync && (
            <span className="text-xs text-tx-muted">
              {resync.processados} clientes processados · <b className="text-tx">{resync.novos}</b> arquivo(s) novo(s)
              {resync.rodando && resync.restantes > 0 && ` · ${resync.restantes} restantes`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-2 mt-1" style={{ borderTop: `1px solid ${tint(COLORS.acao, 15)}` }}>
          <button onClick={corrigirDatas} className="btn-secondary" style={{ fontSize: 12.5 }}>
            {reparse?.rodando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pausar</> : <><Calendar className="h-3.5 w-3.5" /> Corrigir datas dos documentos</>}
          </button>
          <span className="text-[11px] text-tx-muted">
            reprocessa NFS-e/CT-e que ficaram sem data (bug antigo) → passam a contar no ano/mês certo
            {reparse && <> · <b className="text-tx">{reparse.corrigidos}</b> corrigidos{reparse.rodando && reparse.restantes > 0 ? ` · ${reparse.restantes} restantes` : ''}</>}
          </span>
        </div>
      </div>

      {/* Conta de Serviço — caminho recomendado (sem login/senha) */}
      <div className="card-aura space-y-3" style={{ borderColor: tint(COLORS.ok, 30), background: tint(COLORS.ok, 5) }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="text-[15px] font-semibold text-tx-strong">Conta de Serviço — recomendado</h2>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-ok rounded"
            style={{ background: tint(COLORS.ok, 12), border: `1px solid ${tint(COLORS.ok, 30)}` }}>Sem senha</span>
        </div>
        <p className="text-xs text-tx-muted">
          O jeito mais simples e seguro: você compartilha a pasta do Drive com o e-mail do robô abaixo
          (permissão Leitor) e a IA lê todos os documentos dela. Nenhuma senha, nenhuma tela de login.
        </p>

        {!sa.configured ? (
          <div className="rounded-lg p-3 text-xs text-warn leading-relaxed"
            style={{ background: tint(COLORS.atencao, 5), border: `1px solid ${tint(COLORS.atencao, 30)}` }}>
            <b>Falta 1 passo no Railway.</b> Crie uma Conta de Serviço no Google Cloud, baixe o JSON e cole no
            Railway → backend → Variables como <code className="px-1 bg-inset rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code>.
            Assim que salvar, o e-mail do robô aparece aqui.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-inset p-2.5">
              <span className="text-[11px] text-tx-muted flex-shrink-0">Compartilhe a pasta com:</span>
              <code className="text-xs text-ok font-mono truncate flex-1">{sa.email}</code>
              <button onClick={() => { navigator.clipboard.writeText(sa.email!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="btn-ghost p-1 flex-shrink-0">
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={saLabel} onChange={(e) => setSaLabel(e.target.value)} placeholder="Apelido"
                className="input-aura w-full" />
              <input value={saFolder} onChange={(e) => setSaFolder(e.target.value)} placeholder="ID da pasta compartilhada"
                className="input-aura w-full font-mono" />
            </div>
            <button onClick={connectServiceAccount} disabled={saBusy}
              className="btn-primary w-full justify-center">
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
        <div className="card-aura space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔵</span>
            <h2 className="text-[13px] font-medium text-tx-strong">Google Drive</h2>
          </div>
          <input
            value={labelGoogle}
            onChange={(e) => setLabelGoogle(e.target.value)}
            placeholder="Apelido (ex: Drive Principal)"
            className="input-aura w-full"
          />
          <input
            value={folderGoogle}
            onChange={(e) => setFolderGoogle(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="input-aura w-full font-mono"
          />
          <button
            onClick={() => startConnect('google')}
            className="btn-primary w-full justify-center"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar Google Drive
          </button>
        </div>

        {/* Microsoft */}
        <div className="card-aura space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🟦</span>
            <h2 className="text-[13px] font-medium text-tx-strong">Microsoft OneDrive</h2>
          </div>
          <input
            value={labelMicrosoft}
            onChange={(e) => setLabelMicrosoft(e.target.value)}
            placeholder="Apelido (ex: OneDrive Filial)"
            className="input-aura w-full"
          />
          <input
            value={folderMicrosoft}
            onChange={(e) => setFolderMicrosoft(e.target.value)}
            placeholder="ID da pasta raiz (opcional)"
            className="input-aura w-full font-mono"
          />
          <button
            onClick={() => startConnect('microsoft')}
            className="btn-primary w-full justify-center"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar OneDrive
          </button>
        </div>
      </div>

      {/* Lista de conexões */}
      <div>
        <SectionTitle>Conexões ativas</SectionTitle>
        {loading ? (
          <Spinner />
        ) : conns.length === 0 ? (
          <div className="card-aura">
            <EmptyState icon={<FolderOpen size={32} />} title="Nenhuma conexão ativa" sub="Use os botões acima para conectar." />
          </div>
        ) : (
          <div className="space-y-2">
            {conns.map((c) => {
              const info = PROVIDER_INFO[c.provider];
              return (
                <div key={c.id} className="card-aura flex items-center gap-3">
                  <span className="text-2xl">{info?.icon ?? '☁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-tx-strong">{c.label}</p>
                      <span className="px-1.5 py-0.5 text-[9px] uppercase text-ok rounded"
                        style={{ background: tint(COLORS.ok, 12), border: `1px solid ${tint(COLORS.ok, 30)}` }}>
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
                    className="btn-ghost p-1.5 hover:text-err"
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

      <div className="card-aura" style={{ borderColor: tint(COLORS.atencao, 30), background: tint(COLORS.atencao, 5) }}>
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
