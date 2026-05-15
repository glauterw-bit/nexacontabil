'use client';
import { useEffect, useState, useMemo } from 'react';
import { Briefcase, Loader2, Play, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface CarteiraItem {
  id: string; companyId: string; assignedAt: string;
  company?: { id: string; name: string; cnpj: string; taxRegime: string };
}
interface KanbanTask {
  id: string; companyId: string; stage: string; status: string;
  slaDate: string; slaStatus: string;
  company?: { name: string };
}

const STAGE_LABELS: Record<string, string> = {
  recepcao: 'Recepção', lancamento: 'Lançamento', conciliacao: 'Conciliação',
  apuracao: 'Apuração', obrigacoes: 'Obrigações', revisao: 'Revisão', entregue: 'Entregue',
};

function comp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MinhaCarteiraPage() {
  const toast = useToast();
  const [carteira, setCarteira] = useState<CarteiraItem[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [cR, kR] = await Promise.all([
        fetch(`${API}/api/v1/workflow/carteira`, { headers }),
        fetch(`${API}/api/v1/workflow/kanban?competencia=${comp()}`, { headers }),
      ]);
      const c = await cR.json();
      const board = await kR.json();
      setCarteira(Array.isArray(c) ? c : []);
      const allTasks: KanbanTask[] = [];
      if (Array.isArray(board)) {
        for (const stage of board) for (const t of stage.tasks) allTasks.push(t);
      }
      // Filtro: somente tasks da carteira (minha) — backend já filtra se passar analystId
      setTasks(allTasks);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function action(taskId: string, op: 'start' | 'complete') {
    const token = localStorage.getItem('aura_token') ?? '';
    const r = await fetch(`${API}/api/v1/workflow/tasks/${taskId}/${op}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (r.ok) load();
  }

  const minhasTasks = useMemo(() => tasks, [tasks]);
  const totalMes = minhasTasks.length;
  const concluidas = minhasTasks.filter((t) => t.status === 'concluida').length;
  const vencidas = minhasTasks.filter((t) => t.slaStatus === 'vencido').length;
  const proximas = minhasTasks.filter((t) => t.status !== 'concluida').slice(0, 8);

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <Briefcase className="h-5 w-5 text-indigo-400" />
          <h1 className="text-xl font-semibold text-white">Minha Carteira</h1>
        </div>
        <p className="text-sm text-gray-400">Clientes atribuídos a você e tarefas do mês atual</p>
      </div>

      {loading && (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Clientes" value={carteira.length} icon={Building2} />
            <KPI label="Tasks do mês" value={totalMes} />
            <KPI label="Concluídas" value={concluidas} color="text-emerald-400" />
            <KPI label="Vencidas" value={vencidas} color="text-red-400" />
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
            <h2 className="text-sm font-medium text-white mb-3">Próximas tarefas</h2>
            {proximas.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Nenhuma tarefa pendente neste mês.</p>
            ) : (
              <div className="space-y-2">
                {proximas.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-[#1e2740] bg-[#0f1117]">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{t.company?.name ?? t.companyId}</p>
                      <p className="text-[11px] text-gray-500">
                        {STAGE_LABELS[t.stage]} · vence {new Date(t.slaDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {t.slaStatus === 'vencido' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                    {t.status === 'pendente' && (
                      <button onClick={() => action(t.id, 'start')} className="ml-2 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] rounded inline-flex items-center gap-1">
                        <Play className="h-3 w-3" /> Iniciar
                      </button>
                    )}
                    {t.status === 'em_andamento' && (
                      <button onClick={() => action(t.id, 'complete')} className="ml-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] rounded inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Concluir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
            <h2 className="text-sm font-medium text-white mb-3">Clientes ({carteira.length})</h2>
            {carteira.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Nenhum cliente atribuído. Peça ao gerente para atribuir clientes em /gestao-equipe.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-2">
                {carteira.map((c) => (
                  <div key={c.id} className="p-2.5 rounded border border-[#1e2740] bg-[#0f1117]">
                    <p className="text-sm text-white truncate">{c.company?.name ?? c.companyId}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{c.company?.cnpj}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color }: any) {
  return (
    <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-4">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`h-3.5 w-3.5 ${color || 'text-gray-400'}`} />}
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}
