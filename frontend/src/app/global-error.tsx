'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body style={{ background: 'var(--bg, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', color: 'var(--tx-strong, #0f172a)' }}>
          <h2 style={{ marginBottom: 12 }}>Erro crítico</h2>
          <p style={{ color: 'var(--muted, #64748b)', marginBottom: 20 }}>{error.message}</p>
          <button onClick={reset} style={{ background: 'var(--acao, #4f46e5)', color: 'white', border: 'none', padding: '8px 24px', borderRadius: 8, cursor: 'pointer' }}>
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
