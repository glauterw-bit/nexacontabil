'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CheckCircle2, Clock, AlertTriangle, FileText, Receipt, Scale, Loader2, ChevronRight, Coins } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, Kpi, Spinner, EmptyState, Dot } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: any) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const SEM: Record<string, { cor: string; label: string }> = { verde: { cor: COLORS.ok, label: 'Em dia' }, amarelo: { cor: COLORS.atencao, label: 'Atenção' }, vermelho: { cor: COLORS.erro, label: 'Crítico' } };

function Cliente360() {
  const params = useSearchParams();
  const companyId = params.get('companyId') ?? '';
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    fetch(`${API}/api/v1/paineis/cliente-360?companyId=${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<Building2 size={32} />} title="Cliente não encontrado" sub="Selecione um cliente válido." />;

  const st = SEM[d.status] ?? SEM.amarelo;
  const af = d.analiseFiscal ?? {};

  return (
    <div className="page-narrow">
      <PageHeader icon={<Building2 size={22} color={COLORS.acao} />} title={d.empresa.nome}
        subtitle={`${d.empresa.regime ?? ''}${d.empresa.uf ? ` · ${d.empresa.uf}` : ''}${d.empresa.responsavel ? ` · resp.: ${d.empresa.responsavel}` : ''} · ${d.empresa.cnpj}`}
        action={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: tint(st.cor, 12), color: st.cor, fontSize: 13, fontWeight: 700 }}><Dot cor={st.cor} /> {st.label}</span>} />

      {/* KPIs de topo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Kpi label="Obrigações entregues" value={`${d.obrigacoes.entregues.length}/${d.obrigacoes.totalAno}`} cor={COLORS.ok} sub={`${d.obrigacoes.pctEntrega}% no ano`} />
        <Kpi label="Vencidas" value={d.obrigacoes.vencidas.length} cor={d.obrigacoes.vencidas.length ? COLORS.erro : COLORS.faint} />
        <Kpi label="Pendentes" value={d.obrigacoes.pendentes.length} cor={d.obrigacoes.pendentes.length ? COLORS.atencao : COLORS.faint} />
        <Kpi label="Documentos" value={(d.documentos.total ?? 0).toLocaleString('pt-BR')} sub={`${d.documentos.entradas} entr. · ${d.documentos.saidas} saíd.`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* O QUE FALTA */}
        <Card accent={d.obrigacoes.vencidas.length ? COLORS.erro : COLORS.atencao}>
          <Titulo icon={<AlertTriangle size={15} color={COLORS.erro} />} txt="O que falta" />
          {d.obrigacoes.vencidas.length === 0 && d.obrigacoes.pendentes.length === 0 && <Vazio txt="Nenhuma obrigação em aberto. ✅" />}
          {d.obrigacoes.vencidas.map((o: any, i: number) => <Ob key={`v${i}`} o={o} cor={COLORS.erro} tag="VENCIDA" />)}
          {d.obrigacoes.pendentes.slice(0, 12).map((o: any, i: number) => <Ob key={`p${i}`} o={o} cor={COLORS.atencao} tag="pendente" />)}
        </Card>

        {/* O QUE FOI ENTREGUE */}
        <Card accent={COLORS.ok}>
          <Titulo icon={<CheckCircle2 size={15} color={COLORS.ok} />} txt="O que foi entregue" />
          {d.obrigacoes.entregues.length === 0 && <Vazio txt="Nada marcado como entregue ainda (o recibo no drive marca sozinho)." />}
          {d.obrigacoes.entregues.slice(0, 14).map((o: any, i: number) => <Ob key={`e${i}`} o={o} cor={COLORS.ok} tag="entregue" />)}
        </Card>

        {/* ANÁLISE FISCAL */}
        <Card accent={COLORS.acao}>
          <Titulo icon={<Receipt size={15} color={COLORS.acao} />} txt="Análise fiscal" />
          <Linha k="Faturamento (saídas)" v={BRL(af.faturamento)} />
          <Linha k="Carga tributária" v={`${af.cargaTributaria ?? 0}%`} />
          <Linha k="ICMS" v={BRL(af.impostos?.icms)} />
          <Linha k="PIS/COFINS" v={BRL((af.impostos?.pis ?? 0) + (af.impostos?.cofins ?? 0))} />
          <Linha k="Inconsistências" v={`${af.inconsistencias ?? 0} em ${af.notasComErro ?? 0} notas`} cor={af.inconsistencias ? COLORS.erro : COLORS.faint} />
          {af.monofasico?.valor > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: tint(COLORS.ok, 8), fontSize: 12.5, color: COLORS.ok, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Coins size={14} /> Monofásico: {BRL(af.monofasico.valor)} em {af.monofasico.notas} notas — <Link href={`/laudo-monofasico?companyId=${companyId}`} style={{ color: COLORS.ok, textDecoration: 'underline' }}>gerar laudo</Link>
            </div>
          )}
        </Card>

        {/* ANÁLISE CONTÁBIL */}
        <Card accent={COLORS.info}>
          <Titulo icon={<Scale size={15} color={COLORS.info} />} txt="Análise contábil" />
          <Linha k="Movimento do mês" v={d.analiseContabil?.semMovimentoRecente ? 'sem notas este mês' : 'presente'} cor={d.analiseContabil?.semMovimentoRecente ? COLORS.atencao : COLORS.ok} />
          <Linha k="Notas de entrada" v={d.analiseContabil?.entradasFaltando ? 'faltando' : 'ok'} cor={d.analiseContabil?.entradasFaltando ? COLORS.erro : COLORS.ok} />
          <p style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 8 }}>{d.analiseContabil?.observacao}</p>
          <div style={{ marginTop: 8 }}>
            <Link href={`/cliente-erros?companyId=${companyId}`} className="btn-secondary" style={{ fontSize: 12 }}>Ficha de erros e como corrigir <ChevronRight size={12} /></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Titulo({ icon, txt }: any) { return <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, fontSize: 13, fontWeight: 700, color: COLORS.strong }}>{icon}{txt}</div>; }
function Vazio({ txt }: { txt: string }) { return <p style={{ fontSize: 12.5, color: COLORS.faint }}>{txt}</p>; }
function Linha({ k, v, cor }: { k: string; v: any; cor?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}><span style={{ color: COLORS.muted }}>{k}</span><span className="num" style={{ fontWeight: 600, color: cor ?? COLORS.strong }}>{v}</span></div>;
}
function Ob({ o, cor, tag }: { o: any; cor: string; tag: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5 }}>
      <Dot cor={cor} size={7} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.tipo} <span style={{ color: COLORS.faint }}>· {o.competencia}</span></div>
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: cor, textTransform: 'uppercase' }}>{tag}</span>
      <span className="num" style={{ color: COLORS.faint, width: 62, textAlign: 'right' }}>{dataBR(o.vencimento)}</span>
    </div>
  );
}

export default function Cliente360Page() {
  return <Suspense fallback={<Spinner />}><Cliente360 /></Suspense>;
}
