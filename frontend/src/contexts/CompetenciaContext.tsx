'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

/* Competência (mês fiscal) é a dimensão primária do trabalho contábil.
   Este contexto torna o seletor GLOBAL (no header), regendo todas as visões,
   em vez de um filtro escondido por tela. */

export interface Mes { competencia: string; docs?: number }

interface CompetenciaCtx {
  /** 'YYYY-MM' selecionado, ou '' = automático (mês com entregas reais, decidido pelo backend) */
  competencia: string;
  setCompetencia: (c: string) => void;
  meses: Mes[];
  /** telas informam a competência resolvida pelo backend quando o modo é automático */
  reportResolved: (c: string) => void;
  resolved: string;
}

const Ctx = createContext<CompetenciaCtx>({ competencia: '', setCompetencia: () => {}, meses: [], reportResolved: () => {}, resolved: '' });

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

export function CompetenciaProvider({ children }: { children: ReactNode }) {
  const [competencia, setComp] = useState('');
  const [resolved, setResolved] = useState('');
  const [meses, setMeses] = useState<Mes[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexa_competencia');
      if (saved) setComp(saved);
    } catch {}
    const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
    if (!t) return;
    fetch(`${API}/api/v1/fluxo/competencias`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => Array.isArray(m) && setMeses(m))
      .catch(() => {});
  }, []);

  const setCompetencia = useCallback((c: string) => {
    setComp(c);
    try {
      if (c) localStorage.setItem('nexa_competencia', c);
      else localStorage.removeItem('nexa_competencia');
    } catch {}
  }, []);

  const reportResolved = useCallback((c: string) => setResolved(c), []);

  return <Ctx.Provider value={{ competencia, setCompetencia, meses, reportResolved, resolved }}>{children}</Ctx.Provider>;
}

export const useCompetencia = () => useContext(Ctx);

/** 'YYYY-MM' → 'jun/2026' */
export function fmtCompetencia(c: string): string {
  if (!/^\d{4}-\d{2}$/.test(c)) return c;
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [ano, mes] = c.split('-');
  return `${nomes[parseInt(mes, 10) - 1]}/${ano}`;
}
