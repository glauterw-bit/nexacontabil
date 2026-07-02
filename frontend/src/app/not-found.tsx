import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[#0f1117]">
      <div className="text-center space-y-4">
        <p className="text-8xl font-bold text-indigo-600">404</p>
        <h2 className="text-white text-xl font-bold">Página não encontrada</h2>
        <p className="text-gray-400 text-sm">A página que você procura não existe.</p>
        <Link href="/dashboard" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm transition-colors">
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
