'use client';
import { useEffect, useState, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import {
  Kanban as KanbanIcon, Loader2, Play, CheckCircle2, AlertTriangle, Clock,
  Building2, RefreshCw, User as UserIcon, Pause, MessageSquare, X,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

interface Stage { stage: string; label: string; color: string; tasks: TaskCard[] }
interface TaskCard {
  id: string; companyId: string; analystId?: string; stage: string; status: string;
  competencia: string; slaDate: string; startedAt?: string; completedAt?: string;
  slaStatus: 'no_prazo' | 'vencendo' | 'vencido' | 'concluida';
  company?: { name: string; cnpj: string; taxRegime: string };
  analyst?: { id: string; name: string };
}
interface Comment { id: string; userName: string; text: string; createdAt: string; }

const SLA_BG: Record<string, string> = {
  no_prazo: 'border-emerald-500/30 bg-emerald-500/5',
  vencendo: 'border-amber-500/40 bg-amber-500/10',
  vencido: 'border-red-500/40 bg-red-500/10',
  concluida: 'border-[#1e2740] bg-[#161b2e] opacity-60',
};

function comp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function KanbanPage() {
  const toast = useToast();
  const [competencia, setCompetencia] = useState(comp());
  const [board, setBoard] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null);
  const [openTask, setOpenTask] = useState<TaskCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/v1/workflow/kanban?competencia=${competencia}`, { headers: authHeaders() });
      const d = await r.json();
      setBoard(Array.isArray(d) ? d : []);
    } catch (e: any) {
      toast.push(e?.message ?? 'Erro', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [competencia, toast]);

  useEffect(() => { load(); }, [load]);

  async function generateMonth() {
    const r = await fetch(`${API}/api/v1/workflow/tasks/generate-month`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ competencia }),
    });
    if (r.ok) {
      const d = await r.json();
      toast.push(`${d.tasks} tasks geradas`, { variant: 'success' });
      load();
    }
  }

  async function action(taskId: string, op: 'start' | 'complete' | 'block') {
    const body = op === 'block' ? { motivo: prompt('Motivo do bloqueio?') ?? '' } : {};
    const r = await fetch(`${API}/api/v1/workflow/tasks/${taskId}/${op}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (r.ok) load();
  }

  function onDragStart(e: DragStartEvent) {
    const task = board.flatMap((s) => s.tasks).find((t) => t.id === e.active.id);
    if (task) setActiveTask(task);
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const taskId = e.active.id as string;
    const newStage = e.over?.id as string | undefined;
    if (!newStage || newStage.startsWith('task:')) return;

    const task = board.flatMap((s) => s.tasks).find((t) => t.id === taskId);
    if (!task || task.stage === newStage) return;

    // optimistic: avancar status
    if (newStage === 'entregue') {
      await action(taskId, 'complete');
    } else if (task.status === 'pendente') {
      await action(taskId, 'start');
    } else {
      load();
    }
    toast.push(`Cartão movido para ${board.find((s) => s.stage === newStage)?.label}`, { variant: 'info' });
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
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded">
              DnD
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Arraste cards entre colunas · {totalTasks} task(s) · {vencidos > 0 ? `${vencidos} vencida(s)` : 'no prazo'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg text-xs text-white outline-none"
          />
          <button onClick={load} className="px-3 py-1.5 text-xs bg-[#1e2740] hover:bg-[#2a3550] text-white rounded-lg inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
          <button onClick={generateMonth} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg">
            Gerar mês
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : totalTasks === 0 ? (
        <div className="rounded-xl border border-[#1e2740] bg-[#161b2e] p-10 text-center">
          <KanbanIcon className="h-10 w-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">Nenhuma tarefa em {competencia}</p>
          <p className="text-xs text-gray-500 mt-1">Clique em "Gerar mês" para criar as 7 etapas para cada cliente ativo.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="overflow-x-auto pb-3 -mx-6 md:-mx-8 px-6 md:px-8">
            <div className="flex gap-3 min-w-max">
              {board.map((stage) => (
                <Column key={stage.stage} stage={stage} onAction={action} onOpenTask={setOpenTask} />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeTask && (
              <div className={`rounded-lg border ${SLA_BG[activeTask.slaStatus]} p-2.5 text-xs w-64 shadow-2xl rotate-2`}>
                <p className="text-white font-medium truncate">{activeTask.company?.name}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {openTask && <TaskModal task={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function Column({ stage, onAction, onOpenTask }: { stage: Stage; onAction: any; onOpenTask: (t: TaskCard) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stage });
  return (
    <div className="w-72 flex-shrink-0">
      <div className="rounded-t-xl border border-[#1e2740] bg-[#161b2e] px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
          <p className="text-xs font-medium text-white">{stage.label}</p>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{stage.tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-b-xl border border-t-0 border-[#1e2740] p-2 min-h-[400px] space-y-2 transition-colors ${
          isOver ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-[#0f1117]'
        }`}
      >
        {stage.tasks.length === 0 && (
          <p className="text-center text-[11px] text-gray-600 py-8">— sem tasks —</p>
        )}
        {stage.tasks.map((t) => (
          <DraggableTask key={t.id} task={t} onAction={onAction} onOpen={() => onOpenTask(t)} />
        ))}
      </div>
    </div>
  );
}

function DraggableTask({ task, onAction, onOpen }: { task: TaskCard; onAction: any; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{ opacity: isDragging ? 0 : 1 }}
      className={`rounded-lg border ${SLA_BG[task.slaStatus]} p-2.5 text-xs hover:border-indigo-500/50 transition-colors cursor-move`}
    >
      <div {...listeners} className="touch-none">
        <p className="text-white font-medium truncate">{task.company?.name}</p>
        <p className="text-gray-500 text-[10px] mt-0.5">{task.company?.taxRegime?.replace('_', ' ')}</p>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
          <Clock className="h-3 w-3" />
          {new Date(task.slaDate).toLocaleDateString('pt-BR')} · {task.slaStatus.replace('_', ' ')}
        </div>
        {task.analyst && (
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-indigo-300">
            <UserIcon className="h-2.5 w-2.5" /> {task.analyst.name}
          </div>
        )}
      </div>
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
          <button onClick={onOpen} className="px-2 py-1 bg-[#1e2740] hover:bg-[#2a3550] text-gray-300 text-[10px] rounded inline-flex items-center" title="Comentários">
            <MessageSquare className="h-2.5 w-2.5" />
          </button>
          <button onClick={() => onAction(task.id, 'block')} className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-300 text-[10px] rounded inline-flex items-center" title="Bloquear">
            <Pause className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function TaskModal({ task, onClose }: { task: TaskCard; onClose: () => void }) {
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [chainOk, setChainOk] = useState<boolean | null>(null);

  useEffect(() => { load(); }, [task.id]);

  async function load() {
    const r = await fetch(`${API}/api/v1/workflow/tasks/${task.id}/comments`, { headers: authHeaders() });
    setComments(await r.json());
    const v = await fetch(`${API}/api/v1/workflow/tasks/${task.id}/verify-chain`, { headers: authHeaders() }).then((r) => r.json());
    setChainOk(v?.valid);
  }

  async function add() {
    if (!text.trim()) return;
    setLoading(true);
    await fetch(`${API}/api/v1/workflow/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ text }),
    });
    setText('');
    setLoading(false);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-[#161b2e] border border-[#2a3550] rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[#1e2740] flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{task.company?.name}</p>
            <p className="text-xs text-gray-500">{task.stage} · vence {new Date(task.slaDate).toLocaleDateString('pt-BR')}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white">Comentários e histórico</p>
            {chainOk !== null && (
              <span className={`text-[10px] px-2 py-0.5 rounded ${chainOk ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                {chainOk ? '✓ Audit íntegro' : '✗ Hash quebrado'}
              </span>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto space-y-2 -mx-1 px-1">
            {comments.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">Nenhum comentário ainda.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-2.5 rounded-lg bg-[#0f1117] border border-[#1e2740]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-indigo-300">{c.userName}</p>
                    <p className="text-[10px] text-gray-500">{new Date(c.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <p className="text-xs text-gray-200">{c.text}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Escreva um comentário…"
              className="flex-1 px-3 py-1.5 bg-[#0f1117] border border-[#1e2740] rounded text-xs text-white outline-none"
            />
            <button onClick={add} disabled={loading || !text.trim()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded">
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
