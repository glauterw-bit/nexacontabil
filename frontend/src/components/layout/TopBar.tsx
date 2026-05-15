'use client';
import { useEffect, useState, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Search, ChevronRight, Command, Building2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  documents: 'Documentos',
  transactions: 'Lançamentos',
  copilot: 'Copilot IA',
  whatsapp: 'WhatsApp',
  relatorios: 'Relatórios',
  dre: 'DRE',
  balanco: 'Balanço',
  folha: 'Folha de Pagamento',
  colaboradores: 'Colaboradores',
  'ferias-rescisao': 'Férias e Rescisão',
  patrimonio: 'Patrimônio',
  agenda: 'Agenda Fiscal',
  fiscal: 'Fiscal',
  nova: 'Nova',
  sped: 'SPED',
  esocial: 'eSocial',
  'simples-nacional': 'Simples Nacional',
  boletos: 'Boletos',
  certidoes: 'Certidões',
  obrigacoes: 'Obrigações',
  tributario: 'Planejamento Tributário',
  cashflow: 'Fluxo de Caixa',
  benchmark: 'Benchmark',
  'saude-fiscal': 'Saúde Fiscal',
  honorarios: 'Honorários',
  crm: 'CRM',
  tarefas: 'Tarefas',
  comunicados: 'Comunicados',
  'abertura-empresa': 'Abertura de Empresa',
  mei: 'MEI',
  'portal-cliente': 'Portal do Cliente',
  banking: 'Open Finance',
  assinaturas: 'Assinaturas',
  companies: 'Empresas',
  audit: 'Auditoria',
  settings: 'Configurações',
};

function humanizeSegment(seg: string): string {
  if (ROUTE_LABELS[seg]) return ROUTE_LABELS[seg];
  // monthly slugs like 2026-01 -> "2026/01"
  if (/^\d{4}-\d{2}$/.test(seg)) return seg.replace('-', '/');
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

interface NotificationItem {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  link?: string;
  lida: boolean;
  createdAt: string;
}

export function TopBar({ onOpenCommand }: { onOpenCommand?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedCompany } = useCompany();
  const [showNotif, setShowNotif] = useState(false);
  // local placeholder until /notifications query is wired; show 0 unread cleanly
  const [notifications] = useState<NotificationItem[]>([]);

  const segments = useMemo(
    () => pathname.split('/').filter(Boolean),
    [pathname]
  );
  const unread = notifications.filter((n) => !n.lida).length;

  // Open command palette with Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenCommand?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenCommand]);

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-[#1e2740] bg-[#0f1117] flex-shrink-0 sticky top-0 z-30">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm overflow-x-auto" aria-label="Breadcrumb">
        {segments.length === 0 ? (
          <span className="text-gray-400">Início</span>
        ) : (
          segments.map((seg, idx) => {
            const href = '/' + segments.slice(0, idx + 1).join('/');
            const isLast = idx === segments.length - 1;
            return (
              <span key={href} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-600" />}
                {isLast ? (
                  <span className="text-white font-medium">{humanizeSegment(seg)}</span>
                ) : (
                  <button
                    onClick={() => router.push(href)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {humanizeSegment(seg)}
                  </button>
                )}
              </span>
            );
          })
        )}
      </nav>

      {/* Right side: search + company chip + notifications */}
      <div className="flex items-center gap-3">
        {/* Cmd+K search trigger */}
        <button
          onClick={() => onOpenCommand?.()}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-[#161b2e] border border-[#1e2740] rounded-lg hover:border-indigo-500/50 hover:text-gray-200 transition-colors"
          title="Buscar (Ctrl+K)"
        >
          <Search className="h-4 w-4" />
          <span>Buscar...</span>
          <kbd className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono border border-[#2a3550] rounded text-gray-500">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Company chip */}
        {selectedCompany && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#161b2e] border border-[#1e2740] rounded-lg">
            <Building2 className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs text-gray-300 max-w-[200px] truncate">
              {selectedCompany.name}
            </span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">{selectedCompany.taxRegime?.replace('_', ' ')}</span>
          </div>
        )}

        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotif((v) => !v)}
            className="relative h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Notificações"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-[#0f1117]" />
            )}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-11 w-80 bg-[#161b2e] border border-[#1e2740] rounded-xl shadow-xl py-2 z-40">
              <div className="px-4 py-2 border-b border-[#1e2740] flex items-center justify-between">
                <p className="text-sm font-medium text-white">Notificações</p>
                <span className="text-xs text-gray-500">{unread} não lidas</span>
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Você está em dia.</p>
                  <p className="text-xs text-gray-600 mt-0.5">Nenhuma notificação no momento.</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => n.link && router.push(n.link)}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex gap-3"
                    >
                      <div className="mt-0.5">
                        {n.tipo.includes('vencen') ? (
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                        ) : (
                          <Clock className="h-4 w-4 text-indigo-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{n.titulo}</p>
                        <p className="text-xs text-gray-500 truncate">{n.corpo}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
