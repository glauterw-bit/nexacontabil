'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  Kanban as KanbanIcon, Loader2, Play, CheckCircle2, AlertTriangle, Clock,
  Building2, Filter, RefreshCw, User as UserIcon, Pause,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Stage { stage: string; label: string; color: string; tasks: TaskCard[] }
interface TaskCard {
  id: string; companyId: string; analystId?: string; stage: string; status: string;
  competencia: string; slaDate: string; startedAt?: string; completedAt?: string;
  slaStatus: 'no_prazo' | 'vencendo' | 'vencido' | 'concluida';
  company?: { name: string; cnpj: string; taxRegime: string };
  analyst?: { id: string; name: string; email: string };
}

const SLA_STYLES: Record<string, string> = {
  no_prazo: 'border-emerald-500/30 bg-emerald-500/5',
  vencendo: 'border-amber-500/40 bg-amber-500/10',
  vencido: 'border-red-500/40 bg-red-500/10',
  concluida: 'border-[#1e2740] bg-[#161b2e] opacity-60',
};

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  bloqueada: 'Bloqueada',
};

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function KanbanPage() {
  const toast = useToast();
  const [comp, setComp] = useState(competenciaAtual());
  const [board, setBoard] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [filterAnalyst, setFilterAnalyst] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const params = new URLSearchParams({ competencia: comp });
      if (filterAnalyst) params.set('analystId', filterAnalyst);
      const r = await fetch(`${API}/api/v1/workflow/kanban?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json();
      setBoard(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalysts() {
    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const r = await fetch(`${API}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: '{ companies { id name } }' }),
      });
      const data = await r.json();
      // re-uses companies as a placeholder list of analysts in dev; in prod will switch to users
      setAnalysts([]);
    } catch {}
  }

  useEffect(() => { load(); }, [comp, filterAnalyst]);
  useEffect(() => { loadAnalysts(); }, []);

  async function generateMonth() {
    const token = localStorage.getItem('aura_token') ?? '';
    const r = await fetch(`${API}/api/v1/workflow/tasks/generate-month`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ competencia: comp }),
    });
    if (r.ok) {
      const d = await r.json();
      toast.push(`${d.tasks} tarefa(s) geradas para ${d.companies} empresa(s)`, { variant: 'success', title: 'Mês gerado' });
      load();
    }
  }

  async function action(taskId: string, op: 'start' | 'complete' | 'block') {
    const token = localStorage.getItem('aura_token') ?? '';
    const body = op === 'block' ? { motivo: prompt('Motivo do bloqueio?') ?? '' } : {};
    const r = await fetch(`${API}/api/v1/workflow/tasks/${taskId}/${op}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.push(`Ação executada`, { variant: 'success' });
      load();
    }
  }

  const totalTasks = board.reduce((s, c) => s + c.tasks.length, 0);
  const vencidos = board.reduce((s, c) => s + c.tasks.filter((t) => t.slaStatus === 'vencido').length, 0);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <KanbanIcon className="h-5 w-5 text-indigo-400" />
            <h1 className="text-xl font-semibold text-white">Kanban Operacional</h1>
            <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">Beta</span>
          </div>
          <p className="text-sm text-gray-400">
            Fluxo dos clientes por estágio · {totalTasks} task(s) · {vencidos > 0 ? `${vencidos} vencida(s)` : 'no prazo'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={comp}
            onChange={(e) => setComp(e.target.value)}
            className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none"
          />
          <button onClick={load} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded-lg inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
          <button onClick={generateMonth} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">
            Gerar tasks do mês
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando kanban…
        </div>
      )}

      {!loading && totalTasks === 0 && (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <KanbanIcon className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Nenhuma tarefa no mês {comp}</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Clique em "Gerar tasks do mês" para criar as 7 etapas para cada cliente ativo.
          </p>
        </div>
      )}

      {!loading && totalTasks > 0 && (
        <div className="overflow-x-auto pb-3 -mx-6 md:-mx-8 px-6 md:px-8">
          <div className="flex gap-3 min-w-max">
            {board.map((stage) => (
              <div key={stage.stage} className="w-72 flex-shrink-0">
                <div className="rounded-t-xl border border-[#1e2740] bg-[#161b2e] px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    <p className="text-xs font-medium text-white">{stage.label}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">{stage.tasks.length}</span>
                </div>
                <div className="rounded-b-xl border border-t-0 border-[#1e2740] bg-[#0f1117] p-2 min-h-[400px] space-y-2">
                  {stage.tasks.length === 0 && (
                    <p className="text-center text-[11px] text-gray-600 py-8">— sem tasks —</p>
                  )}
                  {stage.tasks.map((t) => (
                    <TaskCardComp key={t.id} task={t} onAction={action} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCardComp({ task, onAction }: { task: TaskCard; onAction: (id: string, op: any) => void }) {
  const sla = SLA_STYLES[task.slaStatus] ?? '';
  const slaIcon = task.slaStatus === 'vencido' ? AlertTriangle : Clock;
  const SlaIcon = slaIcon;
  const slaText = task.slaStatus === 'concluida'
    ? `Concluída ${new Date(task.completedAt!).toLocaleDateString('pt-BR')}`
    : `${new Date(task.slaDate).toLocaleDateString('pt-BR')} (${task.slaStatus.replace('_', ' ')})`;
  return (
    <div className={`rounded-lg border ${sla} p-2.5 text-xs hover:border-indigo-500/50 transition-colors`}>
      <p className="text-white font-medium truncate">{task.company?.name ?? task.companyId.slice(0, 8)}</p>
      <p className="text-gray-500 text-[10px] mt-0.5">{task.company?.taxRegime?.replace('_', ' ') ?? '—'}</p>
      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
        <SlaIcon className="h-3 w-3" />
        <span>{slaText}</span>
      </div>
      {task.analyst && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-indigo-300">
          <UserIcon className="h-2.5 w-2.5" />
          <span className="truncate">{task.analyst.name}</span>
        </div>
      )}
      {task.status !== 'concluida' && (
        <div className="flex gap-1 mt-2">
          {task.status === 'pendente' && (
            <button onClick={() => onAction(task.id, 'start')} className="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] rounded inline-flex items-center justify-center gap-1">
              <Play className="h-2.5 w-2.5" /> Iniciar
            </button>
          )}
          {task.status === 'em_andamento' && (
            <button onClick={() => onAction(task.id, 'complete')} className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] rounded inline-flex items-center justify-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Concluir
            </button>
          )}
          {task.status !== 'bloqueada' && (
            <button onClick={() => onAction(task.id, 'block')} className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-[10px] rounded inline-flex items-center" title="Bloquear">
              <Pause className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}
      {task.status === 'bloqueada' && (
        <p className="text-[10px] text-amber-400 mt-1.5">⏸ Bloqueada</p>
      )}
    </div>
  );
}
