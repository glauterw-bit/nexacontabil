'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/kit';

// Visão Geral foi incorporada à Central de Operação (a carteira toda com semáforo,
// competência e ações em lote vive lá agora). Mantemos a rota como atalho.
export default function VisaoGeralPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/operacao'); }, [router]);
  return <Spinner />;
}
