'use client';
import { useEffect, useState } from 'react';
import {
  Download, Cpu, Monitor, AppWindow, Apple, Shield, CheckCircle2, AlertTriangle,
  ExternalLink, Loader2, Folder, Search, Keyboard, Cloud, RefreshCw,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface ReleaseInfo {
  version: string;
  publishedAt: string;
  windows?: { downloadUrl: string; size: number };
  mac?: { downloadUrl: string; size: number };
  linux?: { downloadUrl: string; size: number };
  installInstructions: {
    windows: string[];
    mac: string[];
  };
}

function detectPlatform(): 'windows' | 'mac' | 'linux' | 'other' {
  if (typeof window === 'undefined') return 'other';
  const p = navigator.platform.toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux')) return 'linux';
  return 'other';
}

function bytes(n?: number) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AgentDownloadPage() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<'windows' | 'mac' | 'linux' | 'other'>('windows');

  useEffect(() => {
    setPlatform(detectPlatform());
    fetch(`${API}/api/v1/desktop-agent/release`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) setError(data.error);
        else setRelease(data);
      })
      .catch((e) => setError(e?.message ?? 'erro'))
      .finally(() => setLoading(false));
  }, []);

  const platformInfo = {
    windows: { icon: Monitor, label: 'Windows 10/11', release: release?.windows, instructions: release?.installInstructions?.windows },
    mac: { icon: Apple, label: 'macOS', release: release?.mac, instructions: release?.installInstructions?.mac },
    linux: { icon: AppWindow, label: 'Linux', release: release?.linux, instructions: [] },
    other: { icon: AppWindow, label: 'Plataforma não detectada', release: undefined, instructions: [] },
  } as const;

  const current = platformInfo[platform];

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Agent Desktop</h1>
          <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
            Beta
          </span>
        </div>
        <p className="text-sm text-gray-400 max-w-2xl">
          Instale o agente desktop para monitorar pastas locais e de rede continuamente, sem precisar
          do navegador aberto. Cada nova nota fiscal ou boleto é processado automaticamente pela IA contábil
          e indexado para busca instantânea.
        </p>
      </div>

      {/* Download card */}
      <div className="rounded-2xl border border-[#1e2740] bg-gradient-to-br from-[#161b2e] via-[#161b2e] to-[#0f1117] p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Detectamos</p>
            <div className="flex items-center gap-2.5 mb-3">
              <current.icon className="h-5 w-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">{current.label}</h2>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando última versão…
              </div>
            )}
            {!loading && release?.version && release.version !== 'unreleased' && (
              <p className="text-xs text-gray-400">
                Versão <span className="text-gray-200 font-mono">{release.version}</span> ·
                publicada em {new Date(release.publishedAt).toLocaleDateString('pt-BR')}
              </p>
            )}
            {!loading && (!release?.version || release?.version === 'unreleased') && (
              <p className="text-xs text-amber-400">
                Nenhum release publicado ainda. Acione o workflow <code className="text-amber-300">Build Desktop Agent</code> em Actions.
              </p>
            )}
          </div>
          <div className="text-right">
            {current.release ? (
              <a
                href={current.release.downloadUrl}
                className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="h-4 w-4" />
                Baixar Agent
                <span className="text-[10px] opacity-70 ml-1">{bytes(current.release.size)}</span>
              </a>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 px-5 py-3 bg-gray-700 text-gray-400 text-sm font-medium rounded-xl cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Indisponível para {current.label}
              </button>
            )}
          </div>
        </div>

        {/* Other platforms */}
        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-[#1e2740]">
          <span className="text-xs text-gray-500">Outras plataformas:</span>
          <div className="flex gap-2">
            {(['windows', 'mac', 'linux'] as const)
              .filter((p) => p !== platform)
              .map((p) => {
                const info = platformInfo[p];
                const InfoIcon = info.icon;
                return info.release ? (
                  <a
                    key={p}
                    href={info.release.downloadUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-gray-300 border border-[#2a3550] rounded-lg transition-colors"
                  >
                    <InfoIcon className="h-3 w-3" />
                    {info.label}
                  </a>
                ) : (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-[#2a3550] rounded-lg"
                  >
                    <InfoIcon className="h-3 w-3" />
                    {info.label} (em breve)
                  </span>
                );
              })}
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div className="grid md:grid-cols-2 gap-3">
        <Feature
          icon={Folder}
          title="Watch contínuo de pastas"
          description="Aponte para `Z:\contabil\` ou qualquer pasta local. Subpastas são lidas recursivamente. Funciona com drives mapeados de rede."
        />
        <Feature
          icon={Cloud}
          title="Análise por IA automática"
          description="Cada arquivo novo (PDF, XML, JPG, PNG) é enviado para a IA contábil que classifica (NF-e, boleto, holerite...) e extrai dados."
        />
        <Feature
          icon={Search}
          title="Busca instantânea local"
          description="Índice SQLite FTS5 no próprio PC permite busca em milhões de documentos offline. A busca natural na cloud também está disponível."
        />
        <Feature
          icon={Keyboard}
          title="Atalho global Ctrl+Shift+F"
          description="Em qualquer aplicação Windows, pressione e abra a janela de busca rápida. Click duplo abre o arquivo no Explorer."
        />
        <Feature
          icon={RefreshCw}
          title="Auto-update"
          description="Novas versões são baixadas automaticamente. Sem precisar reinstalar."
        />
        <Feature
          icon={Shield}
          title="Privacidade"
          description="JWT armazenado criptografado pelo SO. Comunicação HTTPS. Arquivos são enviados apenas após autenticação."
        />
      </div>

      {/* Install instructions */}
      {!loading && current.instructions && current.instructions.length > 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-6">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
            Como instalar no {current.label}
          </h3>
          <ol className="space-y-2">
            {current.instructions.map((step, i) => (
              <li key={i} className="flex gap-3 text-xs text-gray-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center font-mono">
                  {i + 1}
                </span>
                <span dangerouslySetInnerHTML={{ __html: step.replace(/`(.*?)`/g, '<code class="text-indigo-300 bg-[#0f1117] px-1.5 py-0.5 rounded text-[11px]">$1</code>') }} />
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* SmartScreen warning */}
      {platform === 'windows' && (
        <div className="flex gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300">
            <p className="font-medium mb-1">Alerta SmartScreen no Windows</p>
            <p className="text-amber-300/80 leading-relaxed">
              Na primeira execução, o Windows pode mostrar "Windows protegeu seu computador". Clique em
              <strong> Mais informações</strong> e depois <strong>Executar mesmo assim</strong>.
              O alerta vai desaparecer quando publicarmos com certificado de assinatura comercial.
            </p>
          </div>
        </div>
      )}

      {/* GitHub link */}
      <div className="text-center pt-4">
        <a
          href="https://github.com/glauterw-bit/nexacontabil/tree/master/agent"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gray-500 hover:text-gray-300 inline-flex items-center gap-1"
        >
          Código fonte do agente
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="p-4 rounded-xl border border-[#1e2740] bg-[#161b2e]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-indigo-400" />
        <p className="text-sm font-medium text-white">{title}</p>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}
