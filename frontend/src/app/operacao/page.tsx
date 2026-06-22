'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, Loader2, FileText, FileCheck, AlertTriangle, ClipboardList, ChevronRight, Search } from 'lucide-react';
import { PageHeader, Card, COLORS } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const SEM: Record<string, { cor: string; label: string }> = {
  verde: { cor: '#10b981', label: 'Em dia' },
  amarelo: { cor: '#f59e0b', label: 'Atenção' },
  vermelho: { cor: '#ef4444', label: 'Crítico' },
};

export default function OperacaoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [comp, setComp] = useState('');
  const [meses, setMeses] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/fluxo/competencias`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null).then((m) => m && setMeses(m)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/operacao${comp ? `?competencia=${comp}` : ''}`, { headers: authHeaders() });
      if (r.ok) { const j = await r.json(); setD(j); if (!comp) setComp(j.competencia); }
    } catch {} finally { setLoading(false); }
  }, [comp]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: COLORS.muted }}><Loader2 size={32} className="animate-spin" /></div>;
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: COLORS.faint }}>Sem dados.</div>;

  const s = d.semaforo;
  const lista = (d.clientes ?? [])
    .filter((c: any) => !filtro || c.status === filtro)
    .filter((c: any) => !busca || (c.cliente || '').toLowerCase().includes(busca.toLowerCase()));

  const Bloco = ({ icon, titulo, principal, sub, href, cor }: any) => (
    <Link href={href} style={{ textDecoration: 'none', flex: '1 1 220px' }}>
      <Card accent={cor} style={{ cursor: 'pointer', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: COLORS.muted, fontSize: 13 }}>{icon} {titulo} <ChevronRight size={14} style={{ marginLeft: 'auto' }} /></div>
        <div style={{ fontSize: 26, fontWeight: 700, color: cor, marginTop: 6 }}>{principal}</div>
        <div style={{ fontSize: 12, color: COLORS.faint, marginTop: 2 }}>{sub}</div>
      </Card>
    </Link>
  );

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: 24 }}>
      <PageHeader icon={<Activity size={24} color={COLORS.acao} />} title="Central de Operação"
        subtitle="Situação total da carteira — documentos, declarações, pendências e inconsistências."
        action={meses.length > 0 && (
          <select value={comp} onChange={(e) => setComp(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontSize: 13 }}>
            {meses.map((m) => <option key={m.competencia} value={m.competencia}>{m.competencia} ({m.docs} docs)</option>)}
          </select>
        )} />

      {!d.mesProcessado && (
        <div style={{ marginBottom: 14, padding: 10, background: '#1a1f10', border: '1px solid #3a3215', borderRadius: 8, fontSize: 13, color: '#fcd34d' }}>
          Este mês ainda não teve os recibos verificados no drive — por isso a coluna "Declaração" aparece em branco. Use o <Link href="/fluxo" style={{ color: COLORS.atencao }}>Fluxo</Link> para validar os recibos.
        </div>
      )}

      {/* Semáforo-herói */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', flexWrap: 'wrap' }}>
          {(['verde', 'amarelo', 'vermelho'] as const).map((k) => (
            <button key={k} onClick={() => setFiltro(filtro === k ? '' : k)}
              style={{ flex: 1, minWidth: 120, padding: '14px 16px', background: filtro === k ? `${SEM[k].cor}22` : 'transparent', border: 'none', borderBottom: `3px solid ${SEM[k].cor}`, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEM[k].cor }} />
                <span style={{ fontSize: 28, fontWeight: 800, color: SEM[k].cor }}>{s[k + 's']}</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>{SEM[k].label}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* 4 dimensões */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
        <Bloco icon={<FileText size={15} />} titulo="Documentos" cor={COLORS.acao} href="/organizacao"
          principal={d.documentos.total.toLocaleString('pt-BR')} sub={`${d.documentos.clientesComDocs} clientes · ${d.documentos.clientesSemDocs} sem docs`} />
        <Bloco icon={<FileCheck size={15} />} titulo="Declarações entregues" cor={COLORS.ok} href="/fluxo"
          principal={`${d.declaracoes.entregues}/${d.totalClientes}`} sub={`${d.declaracoes.pendentes} pendentes (recibo no drive)`} />
        <Bloco icon={<ClipboardList size={15} />} titulo="Pendências" cor={COLORS.atencao} href="/solicitacoes"
          principal={d.pendencias.clientes} sub={`${d.pendencias.semDocumentos} sem docs · ${d.pendencias.semEntradas} sem entradas`} />
        <Bloco icon={<AlertTriangle size={15} />} titulo="Inconsistências" cor={COLORS.erro} href="/inconsistencias"
          principal={d.inconsistencias.notas} sub={`${d.inconsistencias.clientes} clientes · ${BRL(d.inconsistencias.valor)}`} />
      </div>

      {/* Tabela por cliente (semáforo) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Situação por cliente {filtro && `· ${SEM[filtro].label}`}</h2>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: COLORS.faint }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
            style={{ padding: '7px 10px 7px 32px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.surface, color: COLORS.text, fontSize: 13 }} />
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', fontSize: 11, color: COLORS.faint, padding: '8px 14px', textTransform: 'uppercase', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ width: 14 }} /><div style={{ flex: 1, paddingLeft: 8 }}>Cliente</div>
          <div style={{ width: 60, textAlign: 'right' }}>Docs</div>
          <div style={{ width: 90, textAlign: 'center' }}>Declaração</div>
          <div style={{ width: 90, textAlign: 'right' }}>Inconsist.</div>
          <div style={{ width: 130 }}>Pendências</div>
        </div>
        {lista.slice(0, 200).map((c: any) => (
          <Link key={c.companyId} href={`/cliente-erros?companyId=${c.companyId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid #141925`, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ width: 14, height: 10, display: 'flex', alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: SEM[c.status].cor }} /></span>
              <div style={{ flex: 1, paddingLeft: 8 }}>
                <div style={{ fontWeight: 600 }}>{c.cliente}</div>
                <div style={{ fontSize: 11, color: COLORS.faint }}>{c.regime}{c.responsavel ? ` · ${c.responsavel}` : ''}</div>
              </div>
              <div style={{ width: 60, textAlign: 'right' }}>{c.docs}</div>
              <div style={{ width: 90, textAlign: 'center', color: c.declaracaoEntregue ? COLORS.ok : COLORS.faint }}>{c.declaracaoEntregue ? '✓ entregue' : '—'}</div>
              <div style={{ width: 90, textAlign: 'right', color: c.inconsistencias ? COLORS.erro : COLORS.faint, fontWeight: c.inconsistencias ? 600 : 400 }}>{c.inconsistencias || '—'}</div>
              <div style={{ width: 130, fontSize: 11, color: COLORS.muted }}>{c.pendencias.slice(0, 2).join(' · ') || '—'}</div>
            </div>
          </Link>
        ))}
      </Card>
    </div>
  );
}
