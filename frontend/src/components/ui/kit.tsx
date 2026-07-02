'use client';
import { ReactNode, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';

/* ── Design System NexaContábil v2 ──
   Todas as cores vêm de CSS variables (globals.css) — light padrão, dark opcional.
   Semântica: índigo (ação) · âmbar (atenção) · vermelho (crítico) · verde (ok) · azul (info).
   Regra de ouro: cor é reservada para STATUS; todo o resto em neutros. */

export const COLORS = {
  bg: 'var(--bg)', surface: 'var(--surface)', surface2: 'var(--surface2)',
  border: 'var(--border)', borderSoft: 'var(--border-soft)',
  text: 'var(--tx)', strong: 'var(--tx-strong)', muted: 'var(--muted)', faint: 'var(--faint)',
  acao: 'var(--acao)', atencao: 'var(--atencao)', erro: 'var(--erro)', ok: 'var(--ok)', info: 'var(--info)',
  dotOk: 'var(--dot-ok)', dotAtencao: 'var(--dot-atencao)', dotErro: 'var(--dot-erro)',
};

/** Tinta translúcida de qualquer cor do tema — substitui o antigo `${cor}22`. */
export const tint = (cor: string, pct = 12) => `color-mix(in srgb, ${cor} ${pct}%, transparent)`;

/* ── Vocabulário canônico de status (cor + ícone + rótulo, nunca só cor) ── */
export type StatusTone = 'ok' | 'atencao' | 'critico' | 'pendente' | 'processando' | 'entregue';
export const STATUS: Record<StatusTone, { cor: string; dot: string; label: string; Icon: any }> = {
  ok:          { cor: COLORS.ok,      dot: COLORS.dotOk,      label: 'Em dia',       Icon: CheckCircle2 },
  entregue:    { cor: COLORS.ok,      dot: COLORS.dotOk,      label: 'Entregue',     Icon: CheckCircle2 },
  atencao:     { cor: COLORS.atencao, dot: COLORS.dotAtencao, label: 'Atenção',      Icon: AlertTriangle },
  critico:     { cor: COLORS.erro,    dot: COLORS.dotErro,    label: 'Crítico',      Icon: AlertCircle },
  pendente:    { cor: COLORS.faint,   dot: COLORS.faint,      label: 'Pendente',     Icon: Clock },
  processando: { cor: COLORS.info,    dot: COLORS.info,       label: 'Em andamento', Icon: RefreshCw },
};

export function StatusChip({ tone, label, size = 'md' }: { tone: StatusTone; label?: string; size?: 'sm' | 'md' }) {
  const s = STATUS[tone];
  const pad = size === 'sm' ? '1px 8px' : '3px 10px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 999, background: tint(s.dot, 13), color: s.cor, fontSize: fs, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <s.Icon size={size === 'sm' ? 11 : 13} />
      {label ?? s.label}
    </span>
  );
}

export function Dot({ cor, size = 10 }: { cor: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: cor, flexShrink: 0, display: 'inline-block' }} />;
}

export function PageHeader({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.strong, display: 'flex', alignItems: 'center', gap: 11, margin: 0, letterSpacing: '-0.01em' }}>
          {icon && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 11, background: tint(COLORS.acao, 12), border: `1px solid ${tint(COLORS.acao, 25)}`, flexShrink: 0 }}>
              {icon}
            </span>
          )}
          {title}
        </h1>
        {subtitle && <p style={{ color: COLORS.muted, fontSize: 13.5, marginTop: 4, marginBottom: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, accent, style, onClick }: { children: ReactNode; accent?: string; style?: any; onClick?: () => void }) {
  return (
    <div onClick={onClick} data-rich-card style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderLeft: accent ? `3px solid ${accent}` : `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-card)', ...style }}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, cor = COLORS.strong, trend, sub, onClick, active }: {
  label: string; value: ReactNode; cor?: string;
  trend?: { dir: 'up' | 'down'; txt: string; bom?: boolean }; sub?: string;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined}
      style={{
        flex: '1 1 150px', background: active ? tint(cor === COLORS.strong ? COLORS.acao : cor, 8) : COLORS.surface,
        border: `1px solid ${active ? (cor === COLORS.strong ? COLORS.acao : cor) : COLORS.border}`,
        borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s, background .15s',
      }}>
      <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div className="num" style={{ fontSize: 26, fontWeight: 700, color: cor, letterSpacing: '-0.02em' }}>{value}</div>
        {trend && (
          <span style={{ fontSize: 12, fontWeight: 600, color: trend.bom ? COLORS.ok : COLORS.erro }}>
            {trend.dir === 'up' ? '↑' : '↓'} {trend.txt}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Número-herói — o KPI principal da tela, com destaque visual. */
export function Hero({ value, label, cor = COLORS.erro, icon }: { value: ReactNode; label: string; cor?: string; icon?: ReactNode }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${tint(cor, 10)}, ${COLORS.surface})`, border: `1px solid ${tint(cor, 30)}`, borderRadius: 16, padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 18 }}>
      {icon && <div style={{ color: cor }}>{icon}</div>}
      <div>
        <div className="num" style={{ fontSize: 40, fontWeight: 800, color: cor, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6 }}>{label}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 15, fontWeight: 600, color: COLORS.strong, margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 7 }}>{children}</h2>;
}

export function Bar({ frac, cor = COLORS.acao, h = 18 }: { frac: number; cor?: string; h?: number }) {
  return <div style={{ height: h, width: `${Math.max(2, Math.min(100, frac * 100))}%`, minWidth: 4, background: cor, borderRadius: 4 }} />;
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, href, style }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md'; disabled?: boolean; href?: string; style?: any;
}) {
  const base: any = {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 8, border: '1px solid transparent', textDecoration: 'none', transition: 'all .15s',
    fontSize: size === 'sm' ? 12.5 : 13.5, padding: size === 'sm' ? '6px 12px' : '9px 16px', opacity: disabled ? 0.5 : 1,
  };
  const variants: any = {
    primary: { background: COLORS.acao, color: '#fff' },
    outline: { background: COLORS.surface, color: COLORS.text, border: `1px solid ${COLORS.border}` },
    ghost:   { background: 'transparent', color: COLORS.muted },
    danger:  { background: tint(COLORS.dotErro, 12), color: COLORS.erro },
  };
  const s = { ...base, ...variants[variant], ...style };
  if (href) return <a href={href} style={s}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} style={s}>{children}</button>;
}

export function EmptyState({ icon, title, sub }: { icon?: ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: COLORS.faint }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: COLORS.faint }}>{icon}</div>}
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.muted }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Spinner({ pad = 60 }: { pad?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: pad, color: COLORS.muted }}>
      <Loader2 size={30} className="animate-spin" />
    </div>
  );
}

/** Painel lateral (drawer) — drill-down sem perder o contexto da lista. */
export function Drawer({ open, onClose, title, width = 520, children }: {
  open: boolean; onClose: () => void; title?: ReactNode; width?: number; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,25,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width, maxWidth: '96vw', height: '100%', background: COLORS.surface, borderLeft: `1px solid ${COLORS.border}`, overflowY: 'auto', boxShadow: 'var(--shadow-pop)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0, background: COLORS.surface, zIndex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.strong, minWidth: 0 }}>{title}</div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: COLORS.faint, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20, flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/** Cabeçalho de tabela padronizado (denso, alta legibilidade). */
export function THead({ cols }: { cols: { label: string; width?: number | string; align?: 'left' | 'right' | 'center' }[] }) {
  return (
    <div style={{ display: 'flex', fontSize: 11, color: COLORS.faint, fontWeight: 600, padding: '8px 14px', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0, background: COLORS.surface, zIndex: 1 }}>
      {cols.map((c, i) => (
        <div key={i} style={{ width: c.width, flex: c.width ? undefined : 1, textAlign: c.align ?? 'left', paddingLeft: i === 0 ? 0 : 8 }}>{c.label}</div>
      ))}
    </div>
  );
}
