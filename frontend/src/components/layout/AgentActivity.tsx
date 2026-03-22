'use client';
import { Brain, Scale, ShieldCheck, FileSearch, CheckSquare } from 'lucide-react';

const AGENTS = [
  { name: 'Supervisor Agent', icon: Brain, color: 'text-brand-500 bg-brand-500/10', decisions: 247, lastAction: 'Orquestrou análise de NF-001' },
  { name: 'Tax Agent', icon: FileSearch, color: 'text-yellow-400 bg-yellow-400/10', decisions: 198, lastAction: 'Validou CFOP 5102 e NCM' },
  { name: 'Accounting Agent', icon: Scale, color: 'text-blue-400 bg-blue-400/10', decisions: 212, lastAction: 'Sugeriu D: 3.1.1.01 / C: 2.1.1.01' },
  { name: 'Compliance Agent', icon: ShieldCheck, color: 'text-green-400 bg-green-400/10', decisions: 185, lastAction: 'Risco BAIXO — despesa dedutível' },
  { name: 'Audit Agent', icon: CheckSquare, color: 'text-purple-400 bg-purple-400/10', decisions: 163, lastAction: 'Auditou 3 decisões — 0 inconsistências' },
];

export function AgentActivity() {
  return (
    <div className="card-aura">
      <h2 className="text-lg font-semibold text-white mb-6">Atividade dos Agentes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {AGENTS.map(agent => {
          const Icon = agent.icon;
          return (
            <div key={agent.name} className="bg-surface rounded-xl p-4 border border-surface-border">
              <div className={`h-9 w-9 rounded-lg ${agent.color} flex items-center justify-center mb-3`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-white">{agent.name}</p>
              <p className="text-2xl font-bold text-white mt-1">{agent.decisions}</p>
              <p className="text-xs text-gray-500 mt-0.5">decisões</p>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">{agent.lastAction}</p>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-green-400">Ativo</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
