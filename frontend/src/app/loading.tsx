export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[#0f1117]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    </div>
  );
}
