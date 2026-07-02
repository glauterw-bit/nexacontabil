'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  Inbox, HardDrive, Mail, Search, Play, Loader2, Copy, Check, CheckCircle2,
  Circle, ExternalLink, FolderOpen, Sparkles, ArrowRight, AlertTriangle,
  Upload, FileText, Brain,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface Conn { id: string; provider: string; label: string; accountEmail: string; rootFolderId?: string | null; }

function appsScript(folderId: string) {
  return `function salvarXmlsNoDrive() {
  // pasta do Drive que a Esteira lê:
  var PASTA_ID = '${folderId || 'COLE_O_ID_DA_PASTA_AQUI'}';

  var pasta = DriveApp.getFolderById(PASTA_ID);
  var label = GmailApp.getUserLabelByName('xml-processado') || GmailApp.createLabel('xml-processado');
  var threads = GmailApp.search('has:attachment filename:xml -label:xml-processado newer_than:3d');

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (anexo) {
        if (anexo.getName().toLowerCase().endsWith('.xml')) {
          if (!pasta.getFilesByName(anexo.getName()).hasNext()) {
            pasta.createFile(anexo.copyBlob()).setName(anexo.getName());
          }
        }
      });
    });
    thread.addLabel(label);
  });
}`;
}

export default function CapturaXmlPage() {
  const toast = useToast();
  const [conns, setConns] = useState<Conn[]>([]);
  const [sa, setSa] = useState<{ configured: boolean; email: string | null }>({ configured: false, email: null });
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [connId, setConnId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [analises, setAnalises] = useState<any[]>([]);

  async function analisarArquivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!ready['anthropic']) { toast.push('A IA (Anthropic) precisa estar ligada — já está ✅', { variant: 'info' }); }
    setAnalisando(true);
    for (const file of Array.from(files)) {
      const nome = file.name;
      setAnalises((prev) => [{ nome, status: 'analisando', dados: null }, ...prev]);
      try {
        const isXml = nome.toLowerCase().endsWith('.xml') || file.type.includes('xml');
        let dados: any;
        if (isXml) {
          const xml = await file.text();
          const r = await fetch(`${API}/api/v1/ai/xml`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ xml }) });
          if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha na análise');
          dados = await r.json();
        } else {
          const fd = new FormData();
          fd.append('file', file);
          const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
          const r = await fetch(`${API}/api/v1/ai/ocr`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
          if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha na análise');
          dados = await r.json();
        }
        setAnalises((prev) => prev.map((a) => a.nome === nome && a.status === 'analisando' ? { nome, status: 'ok', dados } : a));
      } catch (e: any) {
        setAnalises((prev) => prev.map((a) => a.nome === nome && a.status === 'analisando' ? { nome, status: 'erro', erro: e.message } : a));
      }
    }
    setAnalisando(false);
  }

  const load = useCallback(async () => {
    try {
      const [rc, rs, ri] = await Promise.all([
        fetch(`${API}/api/v1/cloud/connections`, { headers: authHeaders() }).then((r) => r.json()).catch(() => []),
        fetch(`${API}/api/v1/cloud/google/service-account`, { headers: authHeaders() }).then((r) => r.json()).catch(() => ({})),
        fetch(`${API}/api/v1/integrations/status`, { headers: authHeaders() }).then((r) => r.json()).catch(() => ({ integrations: [] })),
      ]);
      const gdrive = (Array.isArray(rc) ? rc : []).filter((c: Conn) => c.provider.startsWith('google'));
      setConns(gdrive);
      if (gdrive.length && !connId) {
        setConnId(gdrive[0].id);
        if (gdrive[0].rootFolderId) setFolderId(gdrive[0].rootFolderId);
      }
      setSa(rs || { configured: false, email: null });
      const map: Record<string, boolean> = {};
      (ri.integrations || []).forEach((i: any) => { map[i.key] = i.status === 'configured'; });
      setReady(map);
    } catch { /* noop */ }
  }, [connId]);

  useEffect(() => { load(); }, []);

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500);
  }

  async function rodar() {
    if (!connId) { toast.push('Conecte um Drive primeiro (Passo 1)', { variant: 'error' }); return; }
    setRunning(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/v1/esteira-fiscal/executar`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ connectionId: connId, folderId: folderId || undefined, enviarRelatorios: true }),
      });
      if (!r.ok) throw new Error((await r.json())?.message ?? 'Falha ao rodar');
      const d = await r.json();
      setResult(d);
      toast.push(`${d.roteados}/${d.totalArquivos} roteados · ${d.relatoriosEnviados} relatórios enviados`, { variant: 'success' });
    } catch (e: any) { toast.push(e.message, { variant: 'error' }); }
    finally { setRunning(false); }
  }

  const driveOk = conns.length > 0;
  const folderForScript = folderId || conns.find((c) => c.id === connId)?.rootFolderId || '';

  return (
    <div className="p-5 md:p-8 max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Inbox className="h-5 w-5 text-acao" />
          <h1 className="text-xl font-semibold text-tx-strong">Central de Captura de XMLs</h1>
        </div>
        <p className="text-sm text-tx-muted max-w-2xl">
          Faça as 3 fontes de XML (buscador, Drive e e-mail dos clientes) caírem numa pasta só.
          A Esteira lê tudo de lá, valida a tributação e envia o relatório ao cliente — automático.
        </p>
      </div>

      {/* Prontidão */}
      <div className="flex flex-wrap gap-2">
        <Chip ok={ready['anthropic']} label="IA (Anthropic)" />
        <Chip ok={driveOk} label="Google Drive" />
        <Chip ok={ready['email']} label="E-mail (Resend)" />
      </div>

      {/* TESTAR AGORA — sem Drive */}
      <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-acao" />
          <h2 className="text-sm font-semibold text-tx-strong">Testar a análise da IA agora</h2>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-emerald-500/15 text-ok border border-emerald-500/30 rounded">Sem Drive</span>
        </div>
        <p className="text-xs text-tx-muted">
          Não precisa esperar o Drive: suba alguns XMLs (ou PDFs de NF) e a IA analisa na hora —
          tipo, emitente, valores, impostos e NCM. É o jeito de testar hoje mesmo.
        </p>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-indigo-500/30 rounded-xl py-7 cursor-pointer hover:bg-indigo-500/5 transition-colors">
          <Upload className="h-6 w-6 text-acao" />
          <span className="text-sm text-tx">Clique pra escolher arquivos (.xml, .pdf, imagem)</span>
          <span className="text-[11px] text-tx-faint">pode selecionar vários de uma vez</span>
          <input type="file" multiple accept=".xml,.pdf,image/*,text/xml,application/xml" className="hidden"
            onChange={(e) => analisarArquivos(e.target.files)} disabled={analisando} />
        </label>

        {analises.length > 0 && (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {analises.map((a, i) => (
              <div key={i} className="rounded-lg border border-line bg-inset p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-3.5 w-3.5 text-tx-muted flex-shrink-0" />
                  <span className="text-sm text-tx-strong truncate flex-1">{a.nome}</span>
                  {a.status === 'analisando' && <Loader2 className="h-3.5 w-3.5 animate-spin text-acao" />}
                  {a.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-ok" />}
                  {a.status === 'erro' && <AlertTriangle className="h-3.5 w-3.5 text-err" />}
                </div>
                {a.status === 'erro' && <p className="text-[11px] text-err pl-5">{a.erro}</p>}
                {a.status === 'ok' && a.dados && (
                  <div className="pl-5 space-y-1.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                      {a.dados.tipo && <span className="text-tx-muted">Tipo: <b className="text-tx-strong uppercase">{a.dados.tipo}</b></span>}
                      {a.dados.emitenteNome && <span className="text-tx-muted">Emitente: <b className="text-tx-strong">{a.dados.emitenteNome}</b></span>}
                      {a.dados.valorTotal != null && <span className="text-tx-muted">Valor: <b className="text-ok">{Number(a.dados.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b></span>}
                      {a.dados.dataEmissao && <span className="text-tx-muted">Emissão: <b className="text-tx-strong">{a.dados.dataEmissao}</b></span>}
                    </div>
                    {a.dados.impostos && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-tx-muted">
                        {a.dados.impostos.icms != null && <span>ICMS: {a.dados.impostos.icms}</span>}
                        {a.dados.impostos.ipi != null && <span>IPI: {a.dados.impostos.ipi}</span>}
                        {a.dados.impostos.pis != null && <span>PIS: {a.dados.impostos.pis}</span>}
                        {a.dados.impostos.cofins != null && <span>COFINS: {a.dados.impostos.cofins}</span>}
                      </div>
                    )}
                    {Array.isArray(a.dados.sugestoesContabeis) && a.dados.sugestoesContabeis.length > 0 && (
                      <div className="text-[11px] text-acao">
                        <span className="text-tx-muted">Sugestão contábil: </span>{a.dados.sugestoesContabeis[0]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-tx-muted -mb-2">Ou configure a captura automática (Drive + e-mail + buscador):</p>

      {/* PASSO 1 — Drive */}
      <Step n={1} done={driveOk} icon={HardDrive} title="Conectar a pasta do Drive">
        {!driveOk ? (
          <div className="space-y-2">
            <p className="text-sm text-tx-muted">Nenhum Drive conectado ainda. Conecte a pasta onde os XMLs vão cair.</p>
            <Link href="/drive-conectado" className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
              Conectar Drive <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-tx-muted mb-1">Conexão</label>
              <select value={connId} onChange={(e) => { setConnId(e.target.value); const c = conns.find((x) => x.id === e.target.value); setFolderId(c?.rootFolderId || ''); }}
                className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500">
                {conns.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.accountEmail}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-tx-muted mb-1">ID da pasta (onde tudo cai)</label>
              <div className="flex gap-2">
                <input value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder="cole o ID da pasta do Drive"
                  className="flex-1 bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm font-mono outline-none focus:border-indigo-500" />
                {folderForScript && (
                  <button onClick={() => copy(folderForScript, 'folder')} className="px-3 bg-inset hover:bg-line text-tx rounded-lg">
                    {copied === 'folder' ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-tx-faint mt-1">Está na URL: drive.google.com/drive/folders/<b className="text-tx-muted">ESTE_TRECHO</b></p>
            </div>
          </div>
        )}
      </Step>

      {/* PASSO 2 — Buscador */}
      <Step n={2} done={false} icon={Search} title="Apontar o buscador pra essa pasta">
        <p className="text-sm text-tx-muted mb-2">
          No seu buscador de XMLs (SIEG, Arquivei…), configure a <b className="text-tx">exportação automática</b> pra salvar
          os arquivos na mesma pasta do Drive acima. Assim tudo que ele puxar da SEFAZ entra no fluxo.
        </p>
        {folderForScript && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-tx-muted">Pasta destino:</span>
            <code className="text-acao font-mono">{folderForScript}</code>
            <button onClick={() => copy(folderForScript, 'f2')} className="text-tx-muted hover:text-tx-strong">{copied === 'f2' ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}</button>
          </div>
        )}
      </Step>

      {/* PASSO 3 — E-mail (carteiro) */}
      <Step n={3} done={false} icon={Mail} title="Ligar o “carteiro” do e-mail dos clientes">
        <p className="text-sm text-tx-muted mb-3">
          Os XMLs que os clientes mandam por e-mail entram sozinhos na pasta com este script
          (roda na conta Google do escritório, a cada 15 min, grátis).
        </p>
        <ol className="text-xs text-tx-muted space-y-1 mb-3 list-decimal list-inside">
          <li>Abra <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-acao hover:underline">script.google.com</a> → <b>Novo projeto</b></li>
          <li>Apague tudo, cole o código abaixo (o ID da pasta já vem preenchido)</li>
          <li>Clique no ⏰ <b>Acionadores</b> → Adicionar → função <code className="text-acao">salvarXmlsNoDrive</code> → A cada 15 minutos → Salvar → autorize a conta</li>
        </ol>
        <div className="relative">
          <pre className="bg-inset border border-line rounded-lg p-3 text-[11px] text-tx overflow-x-auto max-h-64">{appsScript(folderForScript)}</pre>
          <button onClick={() => copy(appsScript(folderForScript), 'script')}
            className="absolute top-2 right-2 px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded inline-flex items-center gap-1.5">
            {copied === 'script' ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar script</>}
          </button>
        </div>
        {!folderForScript && (
          <p className="text-[11px] text-warn mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Defina o ID da pasta no Passo 1 pra o script já vir pronto.</p>
        )}
      </Step>

      {/* PASSO 4 — Rodar */}
      <Step n={4} done={!!result} icon={Play} title="Rodar a Esteira">
        <p className="text-sm text-tx-muted mb-3">
          Com a pasta recebendo de todas as fontes, rode a Esteira: ela acha o cliente de cada XML pelo CNPJ,
          valida a tributação (Banco de NCM) e envia o relatório por e-mail/WhatsApp.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={rodar} disabled={running || !driveOk}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm rounded-lg inline-flex items-center gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Rodar Esteira agora
          </button>
          <Link href="/esteira-fiscal" className="px-3 py-2 text-sm text-acao hover:underline inline-flex items-center gap-1">
            Ver execuções <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {result && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Mini label="Arquivos" v={result.totalArquivos} />
            <Mini label="Roteados" v={result.roteados} c="text-ok" />
            <Mini label="Inconsist." v={result.comInconsistencia} c={result.comInconsistencia ? 'text-warn' : 'text-tx-muted'} />
            <Mini label="Relatórios" v={result.relatoriosEnviados} c="text-acao" />
          </div>
        )}
      </Step>

      <div className="rounded-xl border border-line bg-card p-4 flex gap-3">
        <Sparkles className="h-4 w-4 text-acao flex-shrink-0 mt-0.5" />
        <p className="text-xs text-tx-muted leading-relaxed">
          Depois de configurado, a Esteira pode rodar sozinha todo dia (já tem o agendamento noturno).
          O lançamento no Domínio segue manual por enquanto: importe os XMLs limpos no Domínio e use
          <Link href="/exportar-dominio" className="text-acao hover:underline"> Exportar p/ Domínio</Link> pros lançamentos contábeis.
        </p>
      </div>
    </div>
  );
}

function Step({ n, done, icon: Icon, title, children }: any) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? 'bg-emerald-500/20 text-ok' : 'bg-indigo-500/15 text-acao border border-indigo-500/30'}`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </div>
        <Icon className="h-4 w-4 text-tx-muted" />
        <h2 className="text-sm font-medium text-tx-strong">{title}</h2>
      </div>
      <div className="pl-10">{children}</div>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${ok ? 'bg-emerald-500/10 border-emerald-500/30 text-ok' : 'bg-card border-line text-tx-muted'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />} {label}
    </span>
  );
}

function Mini({ label, v, c = 'text-tx-strong' }: { label: string; v: number; c?: string }) {
  return (
    <div className="rounded-lg border border-line bg-inset p-2.5 text-center">
      <p className="text-[11px] text-tx-muted">{label}</p>
      <p className={`text-lg font-bold ${c}`}>{v}</p>
    </div>
  );
}
