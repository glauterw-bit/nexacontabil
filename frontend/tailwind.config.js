/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Tokens semânticos (respondem ao tema via CSS vars) ──
        page: 'var(--bg)',
        card: 'var(--surface)',
        inset: 'var(--surface2)',
        line: {
          DEFAULT: 'var(--border)',
          soft: 'var(--border-soft)',
        },
        tx: {
          DEFAULT: 'var(--tx)',
          strong: 'var(--tx-strong)',
          muted: 'var(--muted)',
          faint: 'var(--faint)',
        },
        acao: 'var(--acao)',
        ok: 'var(--ok)',
        warn: 'var(--atencao)',
        err: 'var(--erro)',
        info: 'var(--info)',
        // ── Escala de marca (fixa, para botões/acentos) ──
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#312e81',
        },
        // legado — telas antigas referenciam surface-*
        surface: {
          DEFAULT: 'var(--bg)',
          card:   'var(--surface)',
          border: 'var(--border)',
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
