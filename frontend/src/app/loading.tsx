export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-page">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-tx-muted text-sm">Carregando...</p>
      </div>
    </div>
  );
}
