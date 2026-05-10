import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DomoSYS — Contabilidade com IA',
  description: 'Sistema de contabilidade com Inteligência Artificial de próxima geração',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-[#0f1117] text-white antialiased font-sans">
        <Providers>
          <AppShell>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
