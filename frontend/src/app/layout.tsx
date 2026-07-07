import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DomoSYS — Contabilidade com IA',
  description: 'Sistema de contabilidade com Inteligência Artificial de próxima geração',
};

// Aplica o tema salvo antes da hidratação para evitar flash. ESCURO é o padrão.
const themeInit = `(function(){try{if(localStorage.getItem('nexa_theme2')!=='light'){document.documentElement.classList.add('dark')}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="bg-page text-tx antialiased font-sans">
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
