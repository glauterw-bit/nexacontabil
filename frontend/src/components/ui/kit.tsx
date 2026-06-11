'use client';
import { ReactNode } from 'react';

/* ── Design System NexaContábil ──
   Paleta: índigo (ação) · âmbar (atenção) · vermelho (erro) · verde (ok)
   Use estes componentes em todas as telas para consistência visual. */

export const COLORS = {
  bg: '#0b0f17', surface: '#161b27', surface2: '#10141d', border: '#2a3142',
  text: '#e2e8f0', muted: '#94a3b8', faint: '#64748b',
  acao: '#6366f1', atencao: '#f59e0b', erro: '#ef4444', ok: '#10b981', info: '#3b82f6',
};

export function PageHeader({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          {icon}{title}
        </h1>
        {subtitle && <p style={{ color: COLORS.muted, marginTop: 4, marginBottom: 0 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: any }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, cor = COLORS.text, trend, sub }: { label: string; value: ReactNode; cor?: string; trend?: { dir: 'up' | 'down'; txt: string; bom?: boolean }; sub?: string }) {
  return (
    <div style={{ flex: '1 1 150px', background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: COLORS.faint }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: cor }}>{value}</div>
        {trend && (
          <span style={{ fontSize: 12, fontWeight: 600, color: trend.bom ? COLORS.ok : COLORS.erro }}>
            {trend.dir === 'up' ? '↑' : '↓'} {trend.txt}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Número-herói — o KPI principal da tela, com destaque visual. */
export function Hero({ value, label, cor = COLORS.erro, icon }: { value: ReactNode; label: string; cor?: string; icon?: ReactNode }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${cor}1a, ${COLORS.surface})`, border: `1px solid ${cor}40`, borderRadius: 16, padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 18 }}>
      {icon && <div style={{ color: cor }}>{icon}</div>}
      <div>
        <div style={{ fontSize: 40, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6 }}>{label}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 600, margin: '26px 0 12px' }}>{children}</h2>;
}

export function Bar({ frac, cor = COLORS.acao, h = 18 }: { frac: number; cor?: string; h?: number }) {
  return <div style={{ height: h, width: `${Math.max(2, Math.min(100, frac * 100))}%`, minWidth: 4, background: cor, borderRadius: 4 }} />;
}
