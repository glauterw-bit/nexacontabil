'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { FolderOpen, FileText, ExternalLink, Search, Folder, ChevronRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, COLORS, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

type Cli = { companyId: string; nome: string; codigo?: string; regime?: string };
type Arq = { nome: string; tipo: 'pasta' | 'arquivo'; abrir: string; tamanhoKB: number; modificado?: string };
type Pasta = { pasta: string; abrirPasta: string; arquivos: Arq[] };
type Dados = { codigo: string; cliente?: string; regime?: string; ano: number; totalPastas: number; pastas: Pasta[] };

const RECIBO_RE = /pgdas|simples nacional|rec\b|recibo|extrato|dctf|reinf|gia|darf|declarac|das\b|movimento/i;

export default function Explorador() {
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Cli | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [ano, setAno] = useState(2026);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/lista-clientes`, { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setClientes(Array.isArray(d) ? d : [])).catch(() => setClientes([]));
  }, []);

  const carregar = useCallback((c: Cli) => {
    if (!c.codigo) { setDados({ codigo: '', cliente: c.nome, ano, totalPastas: 0, pastas: [] } as any); return; }
    setLoading(true); setDados(null);
    fetch(`${API}/api/v1/paineis/explorar-cliente?codigo=${c.codigo}&ano=${ano}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setDados).catch(() => setDados(null)).finally(() => setLoading(false));
  }, [ano]);

  useEffect(() => { if (sel) carregar(sel); }, [sel, ano, carregar]);

  const lista = useMemo(() => {
    if (!busca.trim()) return clientes.slice(0, 40);
    const q = busca.toLowerCase();
    return clientes.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q)).slice(0, 40);
  }, [clientes, busca]);

  return (
    <div style={{ padding: '20px 24px 60px', maxWidth: 1180, margin: '0 auto' }}>
      <PageHeader icon={<FolderOpen size={22} />} title="Explorador de Pastas"
        subtitle="Veja a estrutura real de pastas e documentos de cada cliente no OneDrive — e abra pra conferir manualmente."
        action={
          <select value={ano} onChange={(e) => setAno(parseInt(e.target.value, 10))} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14 }}>
            {[2026, 2025, 2024].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }}>
        {/* lista de clientes */}
        <Card>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9AA0A6' }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
              style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13.5 }} />
          </div>
          <div style={{ maxHeight: '68vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lista.map((c) => (
              <button key={c.companyId} onClick={() => setSel(c)}
                style={{ textAlign: 'left', border: 'none', background: sel?.companyId === c.companyId ? COLORS.acao + '22' : 'transparent', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Folder size={15} style={{ color: COLORS.acao, flex: 'none' }} />
                <span style={{ overflow: 'hidden' }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 550, color: COLORS.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</span>
                  <span style={{ fontSize: 11, color: '#9AA0A6' }}>{c.codigo ? `#${c.codigo} · ` : ''}{c.regime}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* conteudo */}
        <div>
          {!sel ? <EmptyState icon={<FolderOpen />} title="Selecione um cliente" sub="Escolha um cliente à esquerda para ver as pastas e documentos dele." />
            : loading ? <Spinner />
            : !dados ? <EmptyState icon={<AlertTriangle />} title="Não foi possível carregar" />
            : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 650, color: COLORS.strong }}>{dados.cliente ?? sel.nome}</div>
                  <div style={{ fontSize: 12.5, color: '#6B7076' }}>{sel.codigo ? `#${sel.codigo} · ` : ''}{dados.regime} · {dados.totalPastas} pasta(s) de {dados.ano} encontradas</div>
                </div>
                {(dados.pastas ?? []).length === 0 ? (
                  <EmptyState icon={<AlertTriangle />} title={`Nenhuma pasta de ${dados.ano} encontrada`} sub="O sistema não achou nenhum arquivo deste cliente neste ano no OneDrive conectado. Pode ser que os documentos não estejam na pasta, ou estejam em outro local." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {dados.pastas.map((p, i) => {
                      const temRecibo = p.arquivos.some((a) => a.tipo === 'arquivo' && RECIBO_RE.test(a.nome));
                      return (
                        <Card key={i} accent={temRecibo ? COLORS.ok : COLORS.atencao}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                              <FolderOpen size={16} style={{ color: COLORS.acao, flex: 'none' }} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.pasta}</span>
                            </div>
                            {p.abrirPasta ? <a href={p.abrirPasta} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: COLORS.acao, textDecoration: 'none', flex: 'none', fontWeight: 600 }}>abrir pasta <ExternalLink size={13} /></a> : null}
                          </div>
                          {!temRecibo ? <div style={{ fontSize: 12, color: COLORS.atencao, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} /> nenhum arquivo parece comprovante de obrigação aqui</div> : null}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {p.arquivos.length === 0 ? <span style={{ fontSize: 12.5, color: '#9AA0A6' }}>(pasta vazia)</span> :
                              p.arquivos.map((a, j) => (
                                <a key={j} href={a.abrir} target="_blank" rel="noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, textDecoration: 'none', color: COLORS.text, fontSize: 13 }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                                  {a.tipo === 'pasta' ? <Folder size={14} style={{ color: COLORS.acao, flex: 'none' }} /> : <FileText size={14} style={{ color: RECIBO_RE.test(a.nome) ? COLORS.ok : '#9AA0A6', flex: 'none' }} />}
                                  <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.nome}</span>
                                  {a.tamanhoKB ? <span style={{ fontSize: 11, color: '#B0B0B0' }}>{a.tamanhoKB} KB</span> : null}
                                  <ExternalLink size={12} style={{ color: '#C4C7CC', flex: 'none' }} />
                                </a>
                              ))}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <p style={{ fontSize: 12, color: '#9AA0A6', marginTop: 12 }}>Mostra as pastas onde o sistema achou arquivos deste cliente em {dados.ano}. Verde = tem comprovante; âmbar = sem comprovante aparente (confira abrindo a pasta). Clique em qualquer arquivo ou "abrir pasta" para ver no OneDrive.</p>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
