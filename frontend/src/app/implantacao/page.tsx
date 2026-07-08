'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck, CalendarClock, Users, Building2, Inbox, HardDriveDownload,
  CheckCircle2, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';
import { PageHeader, Card, COLORS, tint, Spinner, EmptyState, Btn } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

const ICON: Record<string, any> = {
  calendario: CalendarClock, responsavel: Users, cnpj: Building2, entrada2026: Inbox, drive: HardDriveDownload,
};

export default function ImplantacaoPage() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rodando, setRodando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/paineis/saude-implantacao`, { headers: authHeaders() });
      if (r.ok) setD(await r.json());
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const executar = useCallback(async (acao: string, chave: string) => {
    setRodando(chave); setMsg(null);
    try {
      let url = '', body = '{}';
      if (acao === 'regerar-calendario') { url = `${API}/api/v1/fiscal-calendar/regenerar-todos`; body = JSON.stringify({ ano: d?.ano ?? new Date().getFullYear() }); }
      else if (acao === 'auto-atribuir') url = `${API}/api/v1/paineis/auto-atribuir`;
      else if (acao === 'sincronizar') url = `${API}/api/v1/sync-drive/run`;
      else return;
      const r = await fetch(url, { method: 'POST', headers: authHeaders(), body });
      const j = r.ok ? await r.json() : null;
      if (!r.ok) { setMsg({ tipo: 'erro', texto: 'Não foi possível executar agora. Tente de novo.' }); return; }
      // mensagem amigável por ação
      let texto = 'Feito.';
      if (acao === 'regerar-calendario') texto = `Calendário regerado: ${j.gerados} obrigações em ${j.empresas} clientes.`;
      else if (acao === 'auto-atribuir') texto = `${j.distribuidos} clientes distribuídos entre ${j.entre?.length ?? 0} analistas.`;
      else if (acao === 'sincronizar') texto = 'Varredura do drive iniciada — os números atualizam em instantes.';
      setMsg({ tipo: 'ok', texto });
      await load();
    } catch {
      setMsg({ tipo: 'erro', texto: 'Erro de conexão.' });
    } finally { setRodando(null); }
  }, [d, load]);

  if (loading) return <Spinner />;
  if (!d) return <EmptyState icon={<ClipboardCheck size={32} />} title="Sem dados" sub="Verifique a conexão com o backend." />;

  const pendentes = (d.itens ?? []).filter((i: any) => !i.ok);
  const resolvidos = (d.itens ?? []).filter((i: any) => i.ok);

  return (
    <div className="page-narrow">
      <PageHeader icon={<ClipboardCheck size={22} color={COLORS.acao} />} title="Saúde da implantação"
        subtitle="O que arrumar para o sistema trabalhar por você — em ordem de impacto. Some sozinho quando resolvido."
        action={<button onClick={load} className="btn-secondary"><RefreshCw size={14} /></button>} />

      {/* barra de saúde */}
      <Card style={{ marginBottom: 16, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="num" style={{ fontSize: 30, fontWeight: 800, color: d.pctSaude >= 80 ? COLORS.ok : d.pctSaude >= 40 ? COLORS.atencao : COLORS.erro }}>
            {d.pctSaude}%
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: COLORS.strong }}>
              {d.completo ? 'Implantação completa — sistema pronto' : `${pendentes.length} pontos a resolver`}
            </div>
            <div style={{ marginTop: 6, height: 8, background: COLORS.surface2, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${d.pctSaude}%`, height: '100%', background: d.pctSaude >= 80 ? COLORS.ok : d.pctSaude >= 40 ? COLORS.atencao : COLORS.erro, transition: 'width .3s' }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.faint, textAlign: 'right' }}>{d.total} clientes ativos</div>
        </div>
      </Card>

      {msg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13,
          background: tint(msg.tipo === 'ok' ? COLORS.dotOk : COLORS.dotErro, 10),
          border: `1px solid ${tint(msg.tipo === 'ok' ? COLORS.dotOk : COLORS.dotErro, 30)}`,
          color: msg.tipo === 'ok' ? COLORS.ok : COLORS.erro }}>
          {msg.texto}
        </div>
      )}

      {/* PENDENTES */}
      {pendentes.map((it: any, i: number) => {
        const Icon = ICON[it.chave] ?? ClipboardCheck;
        return (
          <Card key={it.chave} accent={COLORS.dotAtencao} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: tint(COLORS.acao, 12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.acao }}>{i + 1}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={16} color={COLORS.atencao} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.strong }}>{it.titulo}</span>
                </div>
                <p style={{ fontSize: 13, color: COLORS.muted, marginTop: 5 }}>{it.texto}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {it.acao && (
                    <Btn onClick={() => executar(it.acao, it.chave)} size="sm" disabled={rodando === it.chave}>
                      {rodando === it.chave ? <><Loader2 size={13} className="animate-spin" /> executando…</> : <>Resolver agora</>}
                    </Btn>
                  )}
                  {it.rota && (
                    <Link href={it.rota} className="btn-secondary" style={{ fontSize: 12.5 }}>
                      Abrir tela <ChevronRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {pendentes.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 28 }}>
          <CheckCircle2 size={30} color={COLORS.ok} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 700, color: COLORS.strong }}>Tudo pronto!</div>
          <p style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>A base está arrumada. Vá para a <Link href="/operacao" style={{ color: COLORS.acao }}>Central de Operação</Link>.</p>
        </Card>
      )}

      {/* RESOLVIDOS */}
      {resolvidos.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.faint, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Já resolvidos</div>
          {resolvidos.map((it: any) => (
            <div key={it.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, color: COLORS.muted }}>
              <CheckCircle2 size={15} color={COLORS.ok} /> <span style={{ color: COLORS.strong }}>{it.titulo}</span> <span style={{ color: COLORS.faint }}>· {it.texto}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
