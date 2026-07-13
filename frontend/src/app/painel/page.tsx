'use client';
import { useEffect, useState, useMemo } from 'react';
import { LayoutDashboard, Search, RefreshCw, FileText, Send, Wrench, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, Card, COLORS, tint, Spinner, EmptyState, StatusChip } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const nomeMes = (comp?: string) => {
  if (!comp) return '';
  const [a, m] = comp.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const mesAnterior = (comp: string) => {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Cartão grande e claro: número + rótulo simples + o que significa. */
function Bloco({ n, titulo, sub, cor, onClick, ativo }: { n: number; titulo: string; sub?: string; cor: string; onClick?: () => void; ativo?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: '1 1 190px', textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
      background: ativo ? tint(cor, 12) : COLORS.surface, border: `1px solid ${ativo ? tint(cor, 40) : COLORS.border}`,
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 34, fontWeight: 800, color: cor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.strong, marginTop: 6 }}>{titulo}</span>
      {sub && <span style={{ fontSize: 12, color: COLORS.muted }}>{sub}</span>}
    </button>
  );
}

export default function PainelPage() {
  const [dados, setDados] = useState<any>(null);
  const [passado, setPassado] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'verde' | 'amarelo' | 'falta' | 'erro'>('todos');

  useEffect(() => {
    (async () => {
      setCarregando(true);
      try {
        const r = await fetch(`${API}/api/v1/paineis/operacao`, { headers: authHeaders() });
        const d = r.ok ? await r.json() : null;
        setDados(d);
        if (d?.competencia) {
          const rp = await fetch(`${API}/api/v1/paineis/operacao?competencia=${mesAnterior(d.competencia)}`, { headers: authHeaders() });
          if (rp.ok) setPassado(await rp.json());
        }
      } catch {} finally { setCarregando(false); }
    })();
  }, []);

  const s = dados?.semaforo ?? {};
  const clientes: any[] = dados?.clientes ?? [];
  const lista = useMemo(() => clientes.filter((c) => {
    if (filtro === 'verde' && c.status !== 'verde') return false;
    if (filtro === 'amarelo' && c.status !== 'amarelo') return false;
    if (filtro === 'falta' && !(c.status === 'vermelho' && c.motivo === 'falta_documento')) return false;
    if (filtro === 'erro' && !(c.status === 'vermelho' && c.motivo === 'erro_fiscal')) return false;
    return !busca || (c.cliente || '').toLowerCase().includes(busca.toLowerCase());
  }), [clientes, filtro, busca]);

  const obr = dados?.obrigacoesMes ?? {};

  return (
    <div style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
      <PageHeader
        icon={<LayoutDashboard size={20} color={COLORS.acao} />}
        title="Painel do Escritório"
        subtitle={dados ? `Situação de todos os clientes — ${nomeMes(dados.competencia)}` : 'Situação de todos os clientes'}
        action={
          <Link href="/consultor" className="btn-primary" style={{ display: 'inline-flex', gap: 6, fontSize: 13, textDecoration: 'none' }}>
            <Sparkles size={14} /> Perguntar à IA
          </Link>
        }
      />

      {carregando && !dados ? <Spinner /> : !dados ? (
        <EmptyState title="Sem dados" sub="Não foi possível carregar — verifique seu login." />
      ) : (
        <>
          {/* SITUAÇÃO DOS CLIENTES — números grandes, linguagem simples */}
          <p style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 10px' }}>Como estão os clientes agora</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <Bloco n={s.verdes ?? 0} titulo="Em dia" sub="tudo certo" cor={COLORS.ok} onClick={() => setFiltro(filtro === 'verde' ? 'todos' : 'verde')} ativo={filtro === 'verde'} />
            <Bloco n={s.amarelos ?? 0} titulo="Atenção" sub="revisar em breve" cor={COLORS.atencao} onClick={() => setFiltro(filtro === 'amarelo' ? 'todos' : 'amarelo')} ativo={filtro === 'amarelo'} />
            <Bloco n={s.vermelhoFalta ?? 0} titulo="Falta documento" sub="cobrar o cliente" cor={COLORS.erro} onClick={() => setFiltro(filtro === 'falta' ? 'todos' : 'falta')} ativo={filtro === 'falta'} />
            <Bloco n={s.vermelhoErro ?? 0} titulo="Erro na nota" sub="corrigir no sistema" cor={COLORS.erro} onClick={() => setFiltro(filtro === 'erro' ? 'todos' : 'erro')} ativo={filtro === 'erro'} />
          </div>

          {/* OBRIGAÇÕES + MÊS PASSADO — duas faixas simples */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <Card style={{ flex: '1 1 340px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.strong, marginBottom: 10 }}>Obrigações deste mês</p>
              <div style={{ display: 'flex', gap: 18 }}>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: COLORS.ok }}>{obr.entregues ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>entregues</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: COLORS.atencao }}>{obr.proximas7 ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>vencem em 7 dias</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: (obr.vencidas ?? 0) ? COLORS.erro : COLORS.muted }}>{obr.vencidas ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>vencidas</div></div>
              </div>
            </Card>
            <Card style={{ flex: '1 1 340px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: COLORS.strong, marginBottom: 10 }}>Mês passado — {nomeMes(passado?.competencia)}</p>
              {passado ? (
                <div style={{ display: 'flex', gap: 18 }}>
                  <div><div style={{ fontSize: 24, fontWeight: 800, color: COLORS.ok }}>{passado?.obrigacoesMes?.entregues ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>entregues</div></div>
                  <div><div style={{ fontSize: 24, fontWeight: 800, color: (passado?.obrigacoesMes?.vencidas ?? 0) ? COLORS.erro : COLORS.muted }}>{passado?.obrigacoesMes?.vencidas ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>ficaram vencidas</div></div>
                  <div><div style={{ fontSize: 24, fontWeight: 800, color: COLORS.strong }}>{passado?.documentos?.total ?? 0}</div><div style={{ fontSize: 12, color: COLORS.muted }}>documentos</div></div>
                </div>
              ) : <div style={{ fontSize: 12, color: COLORS.muted }}>Sem dados do mês anterior.</div>}
            </Card>
          </div>

          {/* LISTA DE CLIENTES — status em palavras + o que fazer */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.strong }}>Clientes</span>
              {filtro !== 'todos' && <button onClick={() => setFiltro('todos')} className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}>ver todos</button>}
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: COLORS.surface2, borderRadius: 8, padding: '4px 10px' }}>
                <Search size={14} color={COLORS.muted} />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: COLORS.text, width: 160 }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {lista.map((c) => {
                    const critFalta = c.status === 'vermelho' && c.motivo === 'falta_documento';
                    const critErro = c.status === 'vermelho' && c.motivo === 'erro_fiscal';
                    const tone = c.status === 'verde' ? 'ok' : c.status === 'amarelo' ? 'atencao' : 'critico';
                    const rotulo = c.status === 'verde' ? 'Em dia' : c.status === 'amarelo' ? 'Atenção' : critFalta ? 'Falta documento' : critErro ? 'Erro na nota' : 'Crítico';
                    return (
                      <tr key={c.companyId} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                        <td style={{ padding: '10px 8px', minWidth: 180 }}>
                          <div style={{ fontWeight: 600, color: COLORS.strong }}>{c.cliente}</div>
                          <div style={{ fontSize: 11, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
                        </td>
                        <td style={{ padding: '10px 8px', whiteSpace: 'nowrap', color: COLORS.muted, fontVariantNumeric: 'tabular-nums' }}>
                          <FileText size={12} style={{ verticalAlign: -2 }} /> {c.docs ?? 0} docs
                        </td>
                        <td style={{ padding: '10px 8px' }}><StatusChip tone={tone as any} label={rotulo} size="sm" /></td>
                        <td style={{ padding: '10px 8px', color: COLORS.muted, fontSize: 12 }}>
                          {critFalta && <span style={{ color: COLORS.erro, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Send size={12} /> Cobrar documento</span>}
                          {critErro && <span style={{ color: COLORS.erro, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Wrench size={12} /> Corrigir {c.inconsistencias ?? ''} nota(s)</span>}
                          {c.status === 'amarelo' && <span>{(c.pendencias ?? [])[0] ?? 'Revisar'}</span>}
                          {c.status === 'verde' && <span style={{ color: COLORS.ok, display: 'inline-flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={12} /> Nada a fazer</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!lista.length && <tr><td colSpan={4} style={{ padding: 26, textAlign: 'center', color: COLORS.muted }}>Nenhum cliente neste filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/verificacao-final" style={{ fontSize: 13, color: COLORS.acao, textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Verificação completa por cliente <ArrowRight size={13} /></Link>
            <span style={{ color: COLORS.faint }}>·</span>
            <Link href="/farois" style={{ fontSize: 13, color: COLORS.acao, textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Riscos e oportunidades <ArrowRight size={13} /></Link>
          </div>
        </>
      )}
    </div>
  );
}
