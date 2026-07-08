'use client';
import { useEffect, useState, useCallback } from 'react';
import { Landmark, ShieldCheck, ShieldAlert, Search, Loader2, Upload, CheckCircle2, XCircle, Download, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, StatusChip, Spinner } from '@/components/ui/kit';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

interface Cliente { id: string; name: string; responsavel?: string | null }

export default function SefazPage() {
  const toast = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Cliente | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [carregandoStatus, setCarregandoStatus] = useState(false);

  const [senha, setSenha] = useState('');
  const [enviandoCert, setEnviandoCert] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/clientes-atribuicao`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : [])).then((d) => setClientes(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const carregarStatus = useCallback(async (companyId: string) => {
    setCarregandoStatus(true); setStatus(null);
    try {
      const r = await fetch(`${API}/api/v1/sefaz/status?companyId=${companyId}`, { headers: authHeaders() });
      if (r.ok) setStatus(await r.json());
    } catch {} finally { setCarregandoStatus(false); }
  }, []);

  function escolher(c: Cliente) {
    setSel(c); setResultado(null); setSenha(''); carregarStatus(c.id);
  }

  async function enviarCertificado(file: File) {
    if (!sel) return;
    if (!senha) { toast.push('Informe a senha do certificado antes de enviar.', { variant: 'error' }); return; }
    setEnviandoCert(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
        fr.onerror = reject; fr.readAsDataURL(file);
      });
      const query = `mutation($companyId: ID!, $pfx: String!, $senha: String!, $nome: String!) {
        salvarCertificadoA1(companyId: $companyId, pfxBase64: $pfx, senha: $senha, nome: $nome) { id cnpjCpf dataValidade }
      }`;
      const r = await fetch(`${API}/graphql`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ query, variables: { companyId: sel.id, pfx: b64, senha, nome: file.name } }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(j.errors[0]?.message ?? 'Falha ao salvar certificado');
      toast.push('Certificado A1 salvo ✅', { variant: 'success' });
      carregarStatus(sel.id);
    } catch (e: any) {
      toast.push(e.message ?? 'Erro ao enviar certificado (senha incorreta?)', { variant: 'error' });
    } finally { setEnviandoCert(false); }
  }

  async function buscarSefaz() {
    if (!sel) return;
    setBuscando(true); setResultado(null);
    try {
      const r = await fetch(`${API}/api/v1/sefaz/buscar-cliente`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ companyId: sel.id, senha: senha || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? 'Falha na busca');
      setResultado(j);
      toast.push(`SEFAZ: ${j.novos} nota(s) nova(s) · ${j.docsRecebidos} recebidas`, { variant: 'success' });
      carregarStatus(sel.id);
    } catch (e: any) {
      toast.push(e.message ?? 'Erro na busca SEFAZ', { variant: 'error' });
    } finally { setBuscando(false); }
  }

  const filtrados = clientes.filter((c) => !busca || c.name.toLowerCase().includes(busca.toLowerCase())).slice(0, 60);
  const pronto = status?.pronto;

  return (
    <div className="page-narrow">
      <PageHeader icon={<Landmark size={22} color={COLORS.acao} />} title="Buscar no SEFAZ"
        subtitle="Captura nativa das NF-e direto no ambiente nacional (NFeDistribuiçãoDFe), com o certificado do cliente — sem intermediário." />

      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12.5, background: tint(COLORS.acao, 7), border: `1px solid ${tint(COLORS.acao, 20)}`, color: COLORS.muted, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1, color: COLORS.acao }} />
        <span>Puxa as NF-e emitidas <b>contra o CNPJ</b> do cliente, incrementalmente por NSU (retoma de onde parou). Exige o <b>certificado A1</b> do cliente (ou do escritório com procuração e-CAC) e <b>CNPJ real</b>. Cobre NF-e; NFS-e municipal fica por fontes específicas.</span>
      </div>

      {/* seletor de cliente */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', marginBottom: sel ? 10 : 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: COLORS.faint }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
            className="input-aura" style={{ padding: '8px 10px 8px 32px', fontSize: 13, width: '100%' }} />
        </div>
        {!sel && (
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 10 }}>
            {filtrados.map((c) => (
              <button key={c.id} onClick={() => escolher(c)}
                style={{ display: 'flex', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', color: COLORS.text, borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 13, alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, color: COLORS.strong }}>{c.name}</span>
                {c.responsavel && <span style={{ fontSize: 11, color: COLORS.faint }}>· {c.responsavel}</span>}
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: COLORS.strong }}>{sel.name}</span>
            <button onClick={() => { setSel(null); setStatus(null); setResultado(null); }} style={{ marginLeft: 'auto', fontSize: 12, color: COLORS.acao, background: 'none', border: 'none', cursor: 'pointer' }}>trocar cliente</button>
          </div>
        )}
      </Card>

      {carregandoStatus && <Spinner pad={30} />}

      {sel && status && (
        <>
          {/* prontidão */}
          <Card style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Prontidão para consultar</div>
            <Requisito ok={status.certificadoAtivo} txt="Certificado A1 carregado" />
            <Requisito ok={status.cnpjReal} txt="CNPJ real (não provisório)" />
            <Requisito ok={status.ufDefinida} txt="UF do cliente definida" />
            <div style={{ marginTop: 10, fontSize: 12, color: COLORS.faint }}>
              Último NSU lido: <b className="num" style={{ color: COLORS.muted }}>{status.ultNSU}</b>
              {status.maxNSU && <> · fila até <b className="num" style={{ color: COLORS.muted }}>{status.maxNSU}</b></>}
            </div>
          </Card>

          {/* upload de certificado, se faltar */}
          {!status.certificadoAtivo && (
            <Card accent={COLORS.dotAtencao} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ShieldAlert size={16} color={COLORS.atencao} />
                <span style={{ fontWeight: 700, color: COLORS.strong }}>Carregar certificado A1 (.pfx)</span>
              </div>
              <p style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                O arquivo é guardado <b>criptografado</b> (AES-256-GCM) e usado só para autenticar no SEFAZ. A senha não fica em claro.
              </p>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do certificado"
                className="input-aura" style={{ padding: '8px 10px', fontSize: 13, width: '100%', marginBottom: 10 }} />
              <label className="btn-primary" style={{ cursor: enviandoCert ? 'wait' : 'pointer', display: 'inline-flex' }}>
                {enviandoCert ? <><Loader2 size={15} className="animate-spin" /> enviando…</> : <><Upload size={15} /> Escolher .pfx e enviar</>}
                <input type="file" accept=".pfx,.p12" hidden disabled={enviandoCert}
                  onChange={(e) => e.target.files?.[0] && enviarCertificado(e.target.files[0])} />
              </label>
            </Card>
          )}

          {/* buscar */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={buscarSefaz} disabled={!pronto || buscando} className="btn-primary" style={{ opacity: pronto ? 1 : 0.5 }}>
                {buscando ? <><Loader2 size={16} className="animate-spin" /> consultando o SEFAZ…</> : <><Download size={16} /> Buscar no SEFAZ agora</>}
              </button>
              {status.certificadoAtivo && !pronto && (
                <span style={{ fontSize: 12, color: COLORS.atencao, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={13} /> {!status.cnpjReal ? 'CNPJ provisório' : !status.ufDefinida ? 'defina a UF do cliente' : 'requisitos incompletos'}
                </span>
              )}
            </div>

            {resultado && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: COLORS.surface2, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Num n={resultado.novos} label="novas" cor={COLORS.ok} />
                  <Num n={resultado.docsRecebidos} label="recebidas" cor={COLORS.muted} />
                  <Num n={resultado.duplicados} label="já tínhamos" cor={COLORS.faint} />
                </div>
                <div style={{ fontSize: 12, color: COLORS.faint }}>
                  cStat {resultado.cStat} — {resultado.motivo || '—'} · NSU {resultado.ultNSU}/{resultado.maxNSU}
                  {resultado.fimDaFila && <span style={{ color: COLORS.ok }}> · fila em dia (aguarde ~1h p/ nova consulta)</span>}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Requisito({ ok, txt }: { ok: boolean; txt: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0', color: ok ? COLORS.muted : COLORS.erro }}>
      {ok ? <CheckCircle2 size={15} color={COLORS.ok} /> : <XCircle size={15} color={COLORS.erro} />} {txt}
    </div>
  );
}
function Num({ n, label, cor }: { n: number; label: string; cor: string }) {
  return (
    <div>
      <div className="num" style={{ fontSize: 20, fontWeight: 800, color: n > 0 ? cor : COLORS.faint }}>{n ?? 0}</div>
      <div style={{ fontSize: 11, color: COLORS.faint }}>{label}</div>
    </div>
  );
}
