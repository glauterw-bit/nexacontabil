'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, TrendingDown, Gauge, Percent, PieChart, ChevronRight, CheckCircle2, CalendarClock, FileWarning, Receipt } from 'lucide-react';
import { PageHeader, Card, SectionTitle, COLORS, Spinner, EmptyState, Dot, tint, StatusChip } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const corSub = (p: number) => p >= 95 ? COLORS.erro : p >= 80 ? COLORS.atencao : COLORS.ok;
const dotSub = (p: number) => p >= 95 ? COLORS.dotErro : p >= 80 ? COLORS.dotAtencao : COLORS.dotOk;

export default function FaroisPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/v1/paineis/farois`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then(setD).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<Lightbulb size={32} />} title="Sem dados dos faróis" sub="Verifique a conexão com o backend." />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<Lightbulb size={22} color={COLORS.atencao} />} title="Faróis — Risco & Oportunidade"
        subtitle="Alertas que o gestor precisa ver: o que pode dar problema e onde há dinheiro na mesa." />

      {d.reforma2026 && <Reforma2026 r={d.reforma2026} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 16 }}>
        {/* 1. SUBLIMITE SIMPLES */}
        <div>
          <SectionTitle><Gauge size={15} color={COLORS.erro} /> Sublimite do Simples <Contador n={d.sublimiteSimples?.emRisco} txt="em risco" cor={COLORS.erro} /></SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Explica txt="Teto de R$ 4,8 mi/ano de receita acumulada (RBT12). Atenção acima de 80% · crítico acima de 95%." />
            {(d.sublimiteSimples?.clientes ?? []).filter((c: any) => c.status !== 'verde').slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} dot={dotSub(c.pctLimite)}
                direita={<><strong className="num" style={{ color: corSub(c.pctLimite) }}>{c.pctLimite}%</strong><div style={{ fontSize: 11, color: COLORS.faint }}>RBT12 {BRL(c.rbt12)}</div></>} />
            ))}
            {(d.sublimiteSimples?.emRisco ?? 0) === 0 && <Vazio txt="Nenhum cliente próximo do sublimite" />}
          </Card>
        </div>

        {/* 2. QUEDA DE FATURAMENTO */}
        <div>
          <SectionTitle><TrendingDown size={15} color={COLORS.atencao} /> Queda de faturamento <Contador n={d.quedaFaturamento?.emQueda} txt="clientes" cor={COLORS.atencao} /></SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Explica txt="Último mês caiu 30%+ vs a média recente — sinal de problema no negócio ou risco de churn." />
            {(d.quedaFaturamento?.clientes ?? []).slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} dot={COLORS.dotAtencao}
                sub={`${c.ultimaComp}: ${BRL(c.ultimoMes)} (média ${BRL(c.mediaAnterior)})`}
                direita={<strong className="num" style={{ color: COLORS.erro }}>−{c.quedaPct}%</strong>} />
            ))}
            {(d.quedaFaturamento?.emQueda ?? 0) === 0 && <Vazio txt="Nenhuma queda relevante" />}
          </Card>
        </div>

        {/* 3. MONOFÁSICO */}
        <div>
          <SectionTitle><Percent size={15} color={COLORS.ok} /> Monofásico — oportunidade de economia</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Explica destaque={BRL(d.monofasico?.valorTotal)} txt={`em produtos monofásicos · ${d.monofasico?.notas ?? 0} notas · ${d.monofasico?.clientesAfetados ?? 0} clientes. PIS/COFINS deve ser 0 na revenda — verificar recolhimento a maior.`} />
            {(d.monofasico?.clientes ?? []).slice(0, 8).map((c: any) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={c.nome} dot={COLORS.dotOk}
                direita={<><strong className="num">{BRL(c.valorMono)}</strong><div style={{ fontSize: 11, color: COLORS.faint }}>{c.notasMono} notas</div></>} />
            ))}
            {(d.monofasico?.clientes ?? []).length === 0 && <Vazio txt="Nenhum produto monofásico identificado" />}
          </Card>
        </div>

        {/* 4. CONCENTRAÇÃO */}
        <div>
          <SectionTitle><PieChart size={15} color={COLORS.acao} /> Concentração de receita — risco do escritório</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Explica txt={`Top 5 clientes = ${d.concentracao?.top5Pct ?? 0}% · Top 10 = ${d.concentracao?.top10Pct ?? 0}% do faturamento. ${(d.concentracao?.top5Pct ?? 0) > 40 ? 'Alta dependência — diversificar a carteira.' : 'Diversificação saudável.'}`}
              alerta={(d.concentracao?.top5Pct ?? 0) > 40} />
            {(d.concentracao?.topClientes ?? []).slice(0, 8).map((c: any, i: number) => (
              <Linha key={c.companyId} companyId={c.companyId} nome={`${i + 1}. ${c.nome}`} dot={COLORS.acao}
                direita={<><strong className="num">{c.pct}%</strong><div style={{ fontSize: 11, color: COLORS.faint }}>{BRL(c.valor)}</div></>} />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Prazos com data marcada do 2º semestre/2026 (Reforma Tributária + NFS-e nacional). */
function Reforma2026({ r }: { r: any }) {
  const dias = (iso: string) => Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000);
  const Prazo = ({ iso }: { iso: string }) => {
    const n = dias(iso);
    const cor = n < 0 ? COLORS.faint : n <= 15 ? COLORS.erro : n <= 45 ? COLORS.atencao : COLORS.muted;
    return <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, background: tint(cor, 12), padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {n < 0 ? 'prazo encerrado' : n === 0 ? 'É HOJE' : `faltam ${n} dias`}
    </span>;
  };
  const Cliente = ({ c, direita }: any) => (
    <Link href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5, cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: COLORS.strong, fontWeight: 600 }}>{c.nome}</div>
        {direita}
      </div>
    </Link>
  );
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle><CalendarClock size={15} color={COLORS.erro} /> Prazos da Reforma — 2º semestre/2026</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        {/* ECF 31/07 */}
        <Card accent={COLORS.dotErro} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: COLORS.strong, flexWrap: 'wrap' }}>
              <FileWarning size={15} color={COLORS.erro} /> ECF 2025 · vence 31/07 <Prazo iso={r.ecf?.prazo} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              {r.ecf?.pendentes ?? 0} de {r.ecf?.total ?? 0} clientes de Lucro Real/Presumido sem entrega marcada.
            </div>
          </div>
          {(r.ecf?.clientes ?? []).filter((c: any) => !c.entregue).slice(0, 6).map((c: any) => (
            <Cliente key={c.companyId} c={c} direita={<StatusChip tone="pendente" size="sm" label={c.status === 'sem_item' ? 'sem item' : c.status} />} />
          ))}
          {(r.ecf?.pendentes ?? 0) === 0 && <div style={{ padding: 12, fontSize: 12.5, color: COLORS.ok, textAlign: 'center' }}>✓ Tudo entregue</div>}
        </Card>

        {/* IBS/CBS 03/08 */}
        <Card accent={COLORS.dotAtencao} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: COLORS.strong, flexWrap: 'wrap' }}>
              <Receipt size={15} color={COLORS.atencao} /> IBS/CBS na nota · 03/08 <Prazo iso={r.ibscbs?.prazo} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              A partir de 03/08 a SEFAZ REJEITA nota do regime regular sem os campos IBS/CBS.{' '}
              <strong style={{ color: COLORS.erro }}>{r.ibscbs?.emRisco ?? 0} em risco</strong> · {r.ibscbs?.semDados ?? 0} sem notas 2026 capturadas.
            </div>
          </div>
          {(r.ibscbs?.clientes ?? []).filter((c: any) => c.status !== 'ok').slice(0, 6).map((c: any) => (
            <Cliente key={c.companyId} c={c} direita={
              c.status === 'risco'
                ? <StatusChip tone="critico" size="sm" label={`${c.notas2026Sem} notas sem IBS/CBS`} />
                : <StatusChip tone="pendente" size="sm" label="sem dados 2026" />
            } />
          ))}
          {(r.ibscbs?.total ?? 0) > 0 && (r.ibscbs?.emRisco ?? 0) === 0 && (r.ibscbs?.semDados ?? 0) === 0 &&
            <div style={{ padding: 12, fontSize: 12.5, color: COLORS.ok, textAlign: 'center' }}>✓ Emissores já preenchem IBS/CBS</div>}
        </Card>

        {/* NFS-e nacional 01/09 */}
        <Card accent={COLORS.acao} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: COLORS.strong, flexWrap: 'wrap' }}>
              <Receipt size={15} color={COLORS.acao} /> NFS-e nacional · 01/09 <Prazo iso={r.nfseNacional?.prazo} />
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
              Res. CGSN 189/2026: toda ME/EPP do Simples emite pelo Emissor Nacional a partir de 01/09.
              {' '}{r.nfseNacional?.total ?? 0} clientes do Simples · {r.nfseNacional?.prestadores ?? 0} já emitem NFS-e (migrar primeiro).
            </div>
          </div>
          {(r.nfseNacional?.clientes ?? []).slice(0, 6).map((c: any) => (
            <Cliente key={c.companyId} c={c} direita={
              c.emiteNfse ? <StatusChip tone="atencao" size="sm" label="prestador — migrar" /> : <span style={{ fontSize: 11.5, color: COLORS.faint }}>{c.ativo ? 'ativo' : '—'}</span>
            } />
          ))}
        </Card>
      </div>
    </div>
  );
}

function Contador({ n, txt, cor }: { n?: number; txt: string; cor: string }) {
  if (!n) return null;
  return <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, background: tint(cor, 12), padding: '2px 9px', borderRadius: 999 }}>{n} {txt}</span>;
}

function Explica({ txt, destaque, alerta }: { txt: string; destaque?: string; alerta?: boolean }) {
  return (
    <div style={{ padding: '9px 14px', fontSize: 12, color: alerta ? COLORS.atencao : COLORS.muted, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
      {destaque && <strong style={{ color: COLORS.ok, fontSize: 13 }}>{destaque} </strong>}{txt}
    </div>
  );
}

function Linha({ companyId, nome, sub, dot, direita }: any) {
  return (
    <Link href={`/cliente-erros?companyId=${companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${COLORS.borderSoft}`, cursor: 'pointer', transition: 'background .1s' }}>
        <Dot cor={dot} size={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.strong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
          {sub && <div style={{ fontSize: 11, color: COLORS.faint }}>{sub}</div>}
        </div>
        <div className="num" style={{ textAlign: 'right', fontSize: 13, color: COLORS.text }}>{direita}</div>
        <ChevronRight size={14} color={COLORS.faint} />
      </div>
    </Link>
  );
}

function Vazio({ txt }: { txt: string }) {
  return (
    <div style={{ padding: 18, textAlign: 'center', color: COLORS.ok, fontSize: 13, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
      <CheckCircle2 size={15} /> {txt}
    </div>
  );
}
