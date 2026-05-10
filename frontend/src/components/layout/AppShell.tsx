'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Zap } from 'lucide-react';

const AUTH_PATHS = ['/login', '/signup'];

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0f1117] flex-col gap-4">
      <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center">
        <Zap className="h-5 w-5 text-white" />
      </div>
      <div className="h-7 w-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!user && !isAuthPage) {
      setRedirecting(true);
      router.replace('/login');
    } else if (user && isAuthPage) {
      setRedirecting(true);
      router.replace('/dashboard');
    } else {
      setRedirecting(false);
    }
  }, [user, isAuthPage]);

  // Mostra spinner enquanto redireciona
  if (redirecting) return <Spinner />;

  // Páginas de auth (login/signup) sem sidebar
  if (isAuthPage) return <>{children}</>;

  // Usuário autenticado → layout completo
  if (user) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[#0f1117]">
          {children}
        </main>
      </div>
    );
  }

  return <Spinner />;
}
