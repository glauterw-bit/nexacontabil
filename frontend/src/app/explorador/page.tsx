'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { FolderOpen, FileText, ExternalLink, Search, Folder, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, COLORS, Spinner, EmptyState } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

type Cli = { companyId: string; nome: string; codigo?: string; regime?: string };
type Item = { nome: string; caminho: string; nivel: number; tipo: 'pasta' | 'arquivo'; abrir: string; tamanhoKB: number; modificado?: string };
type Dados = { codigo: string; cliente?: string; regime?: string; raiz?: string; abrirRaiz?: string; total: number; truncado?: boolean; pastas?: number; arquivos?: number; itens: Item[]; erro?: string; msg?: string };

const RECIBO_RE = /pgdas|simples nacional|\brec\b|recibo|extrato|dctf|reinf|\bgia\b|darf|declarac|\bdas\b|movimento|comprovante|guia/i;

export default function Explorador() {
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Cli | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroDoc, setFiltroDoc] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/lista-clientes`, { headers: authHeaders() })
      .then((r) => r.json()).then((d) => setClientes(Array.isArray(d) ? d : [])).catch(() => setClientes([]));
  }, []);

  const carregar = useCallback((c: Cli) => {
    if (!c.codigo) { setDados({ codigo: '', cliente: c.nome, total: 0, itens: [], erro: 'sem_codigo', msg: 'Cliente sem código de pasta cadastrado.' }); return; }
    setLoading(true); setDados(null);
    fetch(`${API}/api/v1/paineis/explorar-cliente?codigo=${c.codigo}`, { headers: authHeaders() })
      .then((r) => r.json()).then(setDados).catch(() => setDados(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (sel) carregar(sel); }, [sel, carregar]);

  const lista = useMemo(() => {
    if (!busca.trim()) return clientes;
    const q = busca.toLowerCase();
    return clientes.filter((c) => c.nome.toLowerCase().includes(q) || String(c.codigo ?? '').includes(q));
  }, [clientes, busca]);

  const arvore = useMemo(() => {
    let its = dados?.itens ?? [];
    its = [...its].sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt', { numeric: true }));
    if (filtroDoc) {
      // mostra só arquivos que parecem comprovante + as pastas no caminho deles
      const keep = new Set<string>();
      for (const it of its) if (it.tipo === 'arquivo' && RECIBO_RE.test(it.nome)) {
        const parts = it.caminho.split('/');
        for (let i = 1; i <= parts.length; i++) keep.add(parts.slice(0, i).join('/'));
      }
      its = its.filter((it) => keep.has(it.caminho));
    }
    return its;
  }, [dados, filtroDoc]);

  return (
    <div style={{ padding: '20px 24px 60px', maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader icon={<FolderOpen size={22} />} title="Explorador de Pastas"
        subtitle="A estrutura REAL de pastas e arquivos de cada cliente no OneDrive — abra e confira com os próprios olhos." />

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }}>
        <Card>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9AA0A6' }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar entre ${clientes.length} clientes…`}
              style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13.5 }} />
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
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

        <div>
          {!sel ? <EmptyState icon={<FolderOpen />} title="Selecione um cliente" sub="Escolha um cliente à esquerda para ver a estrutura real de pastas dele." />
            : loading ? <Spinner />
            : !dados ? <EmptyState icon={<AlertTriangle />} title="Não foi possível carregar" />
            : dados.erro ? <EmptyState icon={<AlertTriangle />} title="Pasta não localizada" sub={dados.msg || 'O sistema não encontrou a pasta deste cliente no OneDrive conectado.'} />
            : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 650, color: COLORS.strong }}>{dados.cliente ?? sel.nome}</div>
                    <div style={{ fontSize: 12.5, color: '#6B7076' }}>
                      Pasta: <b>{dados.raiz}</b> · {dados.pastas} pastas · {dados.arquivos} arquivos {dados.truncado ? '· (amostra grande, truncado)' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: COLORS.strong, cursor: 'pointer' }}>
                      <input type="checkbox" checked={filtroDoc} onChange={(e) => setFiltroDoc(e.target.checked)} /> só comprovantes
                    </label>
                    {dados.abrirRaiz ? <a href={dados.abrirRaiz} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#fff', background: COLORS.acao, padding: '7px 11px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>abrir no OneDrive <ExternalLink size={13} /></a> : null}
                  </div>
                </div>

                {arvore.length === 0 ? (
                  <EmptyState icon={<AlertTriangle />} title="Vazio" sub={filtroDoc ? 'Nenhum arquivo que pareça comprovante nesta pasta.' : 'Esta pasta está vazia.'} />
                ) : (
                  <Card style={{ padding: '8px 6px' }}>
                    <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                      {arvore.map((it, i) => {
                        const isRec = it.tipo === 'arquivo' && RECIBO_RE.test(it.nome);
                        return (
                          <a key={i} href={it.abrir} target="_blank" rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', paddingLeft: 8 + it.nivel * 18, borderRadius: 6, textDecoration: 'none', color: it.tipo === 'pasta' ? COLORS.strong : COLORS.text, fontSize: 13, fontWeight: it.tipo === 'pasta' ? 600 : 400 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                            {it.tipo === 'pasta'
                              ? <Folder size={15} style={{ color: COLORS.acao, flex: 'none' }} />
                              : <FileText size={14} style={{ color: isRec ? COLORS.ok : '#9AA0A6', flex: 'none' }} />}
                            <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{it.nome}</span>
                            {isRec ? <span style={{ fontSize: 10, color: COLORS.ok, background: COLORS.ok + '18', padding: '1px 6px', borderRadius: 999, fontWeight: 700, flex: 'none' }}>comprovante</span> : null}
                            {it.tipo === 'arquivo' && it.tamanhoKB ? <span style={{ fontSize: 10.5, color: '#B0B0B0', flex: 'none' }}>{it.tamanhoKB} KB</span> : null}
                            <ExternalLink size={11} style={{ color: '#D0D0D0', flex: 'none' }} />
                          </a>
                        );
                      })}
                    </div>
                  </Card>
                )}
                <p style={{ fontSize: 12, color: '#9AA0A6', marginTop: 12 }}>Estrutura real lida direto do OneDrive (recursiva). Verde = arquivo que parece comprovante. Clique em qualquer item para abrir no OneDrive. XMLs de notas aparecem também — use "só comprovantes" para focar nos recibos.</p>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
