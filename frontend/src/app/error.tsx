'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[#0f1117]">
      <div className="text-center space-y-4">
        <h2 className="text-white text-xl font-bold">Algo deu errado</h2>
        <p className="text-gray-400 text-sm max-w-md">{error.message || 'Ocorreu um erro inesperado.'}</p>
        <button
          onClick={reset}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
