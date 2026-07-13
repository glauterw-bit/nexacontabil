'use client';
import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Search, Loader2, FileText, CalendarCheck2, Sparkles } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, Spinner, EmptyState, Kpi, StatusChip } from '@/components/ui/kit';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const fmtData = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

export default function VerificacaoFinalPage() {
  const toast = useToast();
  const [rel, setRel] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'pendencia' | 'completos'>('pendencia');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`${API}/api/v1/verificacao-final`, { headers: authHeaders() });
      if (r.ok) setRel(await r.json());
    } catch {} finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function rodarAnalise() {
    setAnalisando(true);
    toast.push('Análise garantidora iniciada (NCM → revalidação → auditoria). Pode levar alguns minutos…');
    try {
      const r = await fetch(`${API}/api/v1/verificacao-final/analise`, { method: 'POST', headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.message ?? 'Falha');
      toast.push(`Análise concluída em ${j.duracaoS}s. Relatório atualizado.`, { variant: 'success' });
      carregar();
    } catch (e: any) { toast.push(e.message ?? 'Erro na análise', { variant: 'error' }); }
    finally { setAnalisando(false); }
  }

  const resumo = rel?.resumo;
  const clientes: any[] = rel?.clientes ?? [];
  const lista = clientes
    .filter((c) => (filtro === 'pendencia' ? !c.ok : filtro === 'completos' ? c.ok : true))
    .filter((c) => !busca || (c.nome || '').toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={{ padding: 24, maxWidth: 1240, margin: '0 auto' }}>
      <PageHeader
        icon={<ShieldCheck size={20} color={COLORS.acao} />}
        title="Verificação final"
        subtitle="Apuração cliente a cliente: arquivos carregados, fontes ativas e obrigações entregues × faltantes"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={carregar} disabled={carregando} style={{ display: 'inline-flex', gap: 6, fontSize: 13 }}>
              <RefreshCw size={14} className={carregando ? 'animate-spin' : undefined} /> Atualizar
            </button>
            <button className="btn-primary" onClick={rodarAnalise} disabled={analisando} style={{ display: 'inline-flex', gap: 6, fontSize: 13 }}>
              {analisando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Rodar análise garantidora
            </button>
          </div>
        }
      />

      {carregando && !rel ? <Spinner /> : !resumo ? (
        <EmptyState title="Sem dados" sub="Não foi possível carregar o relatório — verifique seu login." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Kpi label="Clientes" value={resumo.clientes} onClick={() => setFiltro('todos')} active={filtro === 'todos'} />
            <Kpi label="Completos" value={resumo.completos} cor={COLORS.ok} onClick={() => setFiltro('completos')} active={filtro === 'completos'} />
            <Kpi label="Com pendência" value={resumo.comPendencia} cor={resumo.comPendencia ? COLORS.atencao : COLORS.ok} onClick={() => setFiltro('pendencia')} active={filtro === 'pendencia'} />
            <Kpi label="Docs no acervo" value={resumo.docs.total.toLocaleString('pt-BR')} sub={`${resumo.docs.doSefaz.toLocaleString('pt-BR')} do SEFAZ · ${resumo.docs.doAno.toLocaleString('pt-BR')} de ${resumo.ano}`} />
            <Kpi label="Obrigações entregues" value={resumo.obrigacoes.entregues.toLocaleString('pt-BR')} cor={COLORS.ok} sub={`de ${resumo.obrigacoes.total.toLocaleString('pt-BR')} em ${resumo.ano}`} />
            <Kpi label="Faltantes" value={resumo.obrigacoes.faltantes.toLocaleString('pt-BR')} cor={resumo.obrigacoes.faltantes ? COLORS.atencao : COLORS.ok} />
            <Kpi label="Vencidas" value={resumo.obrigacoes.vencidas.toLocaleString('pt-BR')} cor={resumo.obrigacoes.vencidas ? COLORS.erro : COLORS.ok} />
          </div>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Search size={15} color={COLORS.muted} />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: COLORS.text }} />
              <span style={{ fontSize: 12, color: COLORS.muted }}>{lista.length} de {clientes.length}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: COLORS.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '8px 10px' }}>Cliente</th>
                    <th style={{ padding: '8px 10px' }}><FileText size={12} style={{ verticalAlign: -2 }} /> Documentos</th>
                    <th style={{ padding: '8px 10px' }}>Fontes</th>
                    <th style={{ padding: '8px 10px' }}><CalendarCheck2 size={12} style={{ verticalAlign: -2 }} /> Obrigações {resumo.ano}</th>
                    <th style={{ padding: '8px 10px' }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${COLORS.borderSoft}` }}>
                      <td style={{ padding: '10px', minWidth: 180 }}>
                        <div style={{ fontWeight: 600, color: COLORS.strong }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: COLORS.faint }}>{c.cnpj ?? 'sem CNPJ'}{c.uf ? ` · ${c.uf}` : ''}</div>
                      </td>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 700, color: c.docs.total ? COLORS.strong : COLORS.erro }}>{c.docs.total.toLocaleString('pt-BR')}</span>
                        <span style={{ color: COLORS.muted, fontSize: 12 }}> ({c.docs.doDrive} drive · {c.docs.doSefaz} sefaz)</span>
                        <div style={{ fontSize: 11, color: COLORS.faint }}>última emissão: {fmtData(c.docs.ultimaEmissao)}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <StatusChip size="sm" tone={c.fontes.pastaDrive ? (c.fontes.deltaLido ? 'ok' : 'processando') : 'critico'} label={c.fontes.pastaDrive ? (c.fontes.deltaLido ? 'Drive lido' : 'Drive lendo…') : 'Sem pasta'} />
                          <StatusChip size="sm" tone={c.fontes.sefazConsultado ? 'ok' : 'pendente'} label={c.fontes.sefazConsultado ? (c.fontes.sefazFilaDrenada ? 'SEFAZ em dia' : 'SEFAZ puxando') : 'SEFAZ aguarda'} />
                        </div>
                      </td>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: COLORS.ok, fontWeight: 700 }}>{c.obrigacoes.entregues}</span>
                        <span style={{ color: COLORS.muted }}> entregues · </span>
                        <span style={{ color: c.obrigacoes.faltantes ? COLORS.atencao : COLORS.muted, fontWeight: c.obrigacoes.faltantes ? 700 : 400 }}>{c.obrigacoes.faltantes} faltantes</span>
                        {c.obrigacoes.vencidas > 0 && <span style={{ color: COLORS.erro, fontWeight: 700 }}> · {c.obrigacoes.vencidas} vencidas</span>}
                      </td>
                      <td style={{ padding: '10px', maxWidth: 260 }}>
                        {c.ok ? <StatusChip tone="ok" label="Completo" size="sm" /> : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {c.pendencias.map((p: string, i: number) => (
                              <span key={i} style={{ fontSize: 11.5, color: p.includes('vencida') ? COLORS.erro : COLORS.atencao }}>• {p}</span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!lista.length && (
                    <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: COLORS.muted }}>
                      {filtro === 'pendencia' ? 'Nenhuma pendência — tudo completo 🎉' : 'Nenhum cliente no filtro.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
