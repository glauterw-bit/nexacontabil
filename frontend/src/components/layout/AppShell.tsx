'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { WelcomeOnboarding } from './WelcomeOnboarding';
import { Assistente } from './Assistente';
import { ToastProvider } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { Zap } from 'lucide-react';

const AUTH_PATHS = ['/login', '/signup'];

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-page flex-col gap-4">
      <div className="h-10 w-10 rounded-xl bg-brand-600 flex items-center justify-center">
        <Zap className="h-5 w-5 text-white" />
      </div>
      <div className="h-7 w-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));
  const isClientePage = pathname.startsWith('/meu-escritorio');

  // Home por papel: analista → Meu Dia · cliente → painel mobile · gestor → Operação
  // (nunca /dashboard, que é a ficha de um cliente só).
  const homePorPapel = (u: any) =>
    u?.role === 'analista' ? '/meu-dia' : u?.role === 'cliente' ? '/meu-escritorio' : '/operacao';

  useEffect(() => {
    if (!user && !isAuthPage) {
      setRedirecting(true);
      router.replace('/login');
    } else if (user && isAuthPage) {
      setRedirecting(true);
      router.replace(homePorPapel(user));
    } else if (user?.role === 'cliente' && !isClientePage) {
      // cliente nunca acessa as telas do escritório — sempre no próprio painel
      setRedirecting(true);
      router.replace('/meu-escritorio');
    } else {
      setRedirecting(false);
    }
  }, [user, isAuthPage, isClientePage]);

  // Mostra spinner enquanto redireciona
  if (redirecting) return <Spinner />;

  // Páginas de auth (login/signup) sem sidebar
  if (isAuthPage) return <>{children}</>;

  // Cliente: layout mobile limpo, SEM o menu do escritório
  if (user?.role === 'cliente') {
    return <ToastProvider><div className="min-h-screen bg-page">{children}</div></ToastProvider>;
  }

  // Usuário autenticado (equipe) → layout completo
  if (user) {
    return (
      <ToastProvider>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </ToastProvider>
    );
  }

  return <Spinner />;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden bg-page">
        <TopBar onOpenCommand={() => setCmdOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <WelcomeOnboarding />
      <Assistente />
    </div>
  );
}
