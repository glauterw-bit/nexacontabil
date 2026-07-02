'use client';
import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  title?: string;
}

interface ToastContextValue {
  push: (msg: string, opts?: { variant?: ToastVariant; title?: string; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    (message, opts = {}) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, variant: opts.variant || 'info', title: opts.title }]);
      const duration = opts.durationMs ?? 4500;
      setTimeout(() => remove(id), duration);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const tm = setTimeout(() => setEntering(false), 20);
    return () => clearTimeout(tm);
  }, []);

  const Icon =
    toast.variant === 'success' ? CheckCircle2 :
    toast.variant === 'error' ? XCircle :
    toast.variant === 'warning' ? AlertTriangle : Info;

  const colorClass =
    toast.variant === 'success' ? 'text-ok border-emerald-500/40' :
    toast.variant === 'error' ? 'text-err border-red-500/40' :
    toast.variant === 'warning' ? 'text-warn border-amber-500/40' :
    'text-acao border-indigo-500/40';

  return (
    <div
      className={`pointer-events-auto flex gap-3 items-start min-w-[280px] max-w-md bg-card border ${colorClass} rounded-lg p-3 shadow-pop transition-all duration-150 ${
        entering ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass.split(' ')[0]}`} />
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-sm font-medium text-tx-strong">{toast.title}</p>}
        <p className="text-xs text-tx break-words">{toast.message}</p>
      </div>
      <button onClick={onClose} className="text-tx-muted hover:text-tx-strong">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback: console for non-wrapped consumers
    return {
      push: (m: string, o?: any) => console.log('[toast]', o?.variant || 'info', m),
    } as ToastContextValue;
  }
  return ctx;
}
