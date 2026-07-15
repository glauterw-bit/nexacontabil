'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Zap } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    const role = (user as any)?.role;
    router.replace(role === 'analista' ? '/meu-dia' : role === 'cliente' ? '/meu-escritorio' : '/central-entregas');
  }, [user, loading]);

  return (
    <div className="fixed inset-0 bg-page flex flex-col items-center justify-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center mb-2">
        <Zap className="h-6 w-6 text-white" />
      </div>
      <div className="h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      <p className="text-tx-muted text-sm">Carregando...</p>
    </div>
  );
}
