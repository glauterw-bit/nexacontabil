'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Search, ChevronRight, Command, CalendarDays, AlertCircle, CheckCircle2, Clock, Sun, Moon } from 'lucide-react';
import { useCompetencia, fmtCompetencia } from '@/contexts/CompetenciaContext';

const ROUTE_LABELS: Record<string, string> = {
  operacao: 'Operação',
  farois: 'Faróis',
  'meu-dia': 'Meu Dia',
  carteira: 'Clientes',
  organizacao: 'Documentos',
  prazos: 'Prazos',
  atendimentos: 'Atendimento',
  gerencial: 'Painel Gerencial',
  'visao-geral': 'Visão Geral',
  dashboard: 'Painel do Cliente',
  inconsistencias: 'Inconsistências',
  insights: 'Insights de IA',
  apuracao: 'Apuração',
  solicitacoes: 'Solicitar Clientes',
  produtividade: 'Produtividade',
  'atribuir-responsavel': 'Atribuir Responsáveis',
  'painel-analista': 'Painel do Analista',
  fluxo: 'Fluxo de Trabalho',
  'buscar-docs': 'Buscar Documentos',
  'captura-xml': 'Captura de XMLs',
  'esteira-fiscal': 'Esteira Fiscal',
  'ncm-inteligente': 'Banco de NCM',
  'exportar-dominio': 'Exportar p/ Domínio',
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
  honorarios: 'Honorários',
  crm: 'CRM',
  tarefas: 'Tarefas',
  comunicados: 'Comunicados',
  'abertura-empresa': 'Abertura de Empresa',
  mei: 'MEI',
  'portal-cliente': 'Portal do Cliente',
  banking: 'Open Finance',
  companies: 'Empresas',
  audit: 'Auditoria',
  settings: 'Configurações',
  'gestao-equipe': 'Gestão de Equipe',
  'onboarding-cliente': 'Novo Cliente',
  migracao: 'Migração',
  'drive-conectado': 'Drives Conectados',
  integracoes: 'Integrações',
  'reforma-tributaria': 'Reforma Tributária',
  fechamento: 'Fechamento Mensal',
  'cliente-erros': 'Ficha do Cliente',
  guia: 'Guia de Uso',
};

function humanizeSegment(seg: string): string {
  if (ROUTE_LABELS[seg]) return ROUTE_LABELS[seg];
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

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('nexa_theme2', next ? 'dark' : 'light'); } catch {}
    setDark(next);
  }, []);
  return { dark, toggle };
}

export function TopBar({ onOpenCommand }: { onOpenCommand?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const { competencia, setCompetencia, meses, resolved } = useCompetencia();
  const [showNotif, setShowNotif] = useState(false);
  const [notifications] = useState<NotificationItem[]>([]);

  const segments = useMemo(
    () => pathname.split('/').filter(Boolean),
    [pathname]
  );
  const unread = notifications.filter((n) => !n.lida).length;

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
    <header className="h-14 flex items-center justify-between px-5 border-b border-line bg-card flex-shrink-0 sticky top-0 z-30">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm overflow-x-auto" aria-label="Breadcrumb">
        {segments.length === 0 ? (
          <span className="text-tx-muted">Início</span>
        ) : (
          segments.map((seg, idx) => {
            const href = '/' + segments.slice(0, idx + 1).join('/');
            const isLast = idx === segments.length - 1;
            return (
              <span key={href} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-tx-faint" />}
                {isLast ? (
                  <span className="text-tx-strong font-semibold">{humanizeSegment(seg)}</span>
                ) : (
                  <button
                    onClick={() => router.push(href)}
                    className="text-tx-muted hover:text-tx-strong transition-colors"
                  >
                    {humanizeSegment(seg)}
                  </button>
                )}
              </span>
            );
          })
        )}
      </nav>

      {/* Direita: competência global · busca · tema · notificações */}
      <div className="flex items-center gap-2.5">
        {/* Competência — controle global, não filtro escondido */}
        {meses.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 pl-2.5 pr-1 py-1 bg-inset border border-line rounded-lg"
            title="Competência (mês fiscal) — rege todas as visões">
            <CalendarDays className="h-3.5 w-3.5 text-acao" />
            <select
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="bg-transparent text-[13px] font-medium text-tx-strong appearance-none cursor-pointer focus:outline-none py-0.5 pr-1"
            >
              <option value="">
                {resolved ? `Auto (${fmtCompetencia(resolved)})` : 'Automático'}
              </option>
              {meses.map((m) => (
                <option key={m.competencia} value={m.competencia}>
                  {fmtCompetencia(m.competencia)}{m.docs ? ` · ${m.docs} docs` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Busca ⌘K */}
        <button
          onClick={() => onOpenCommand?.()}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 text-[13px] text-tx-muted bg-inset border border-line rounded-lg hover:border-acao hover:text-tx transition-colors"
          title="Buscar (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Buscar...</span>
          <kbd className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono border border-line rounded text-tx-faint">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Tema claro/escuro */}
        <button
          onClick={toggle}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-tx-muted hover:text-tx-strong hover:bg-inset transition-colors"
          title={dark ? 'Tema claro' : 'Tema escuro'}
          aria-label="Alternar tema"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notificações */}
        <div className="relative">
          <button
            onClick={() => setShowNotif((v) => !v)}
            className="relative h-9 w-9 flex items-center justify-center rounded-lg text-tx-muted hover:text-tx-strong hover:bg-inset transition-colors"
            aria-label="Notificações"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-err rounded-full ring-2 ring-card" />
            )}
          </button>
          {showNotif && (
            <div className="absolute right-0 top-11 w-80 bg-card border border-line rounded-xl shadow-pop py-2 z-40">
              <div className="px-4 py-2 border-b border-line flex items-center justify-between">
                <p className="text-sm font-medium text-tx-strong">Notificações</p>
                <span className="text-xs text-tx-faint">{unread} não lidas</span>
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-tx-faint mx-auto mb-2" />
                  <p className="text-xs text-tx-muted">Você está em dia.</p>
                  <p className="text-xs text-tx-faint mt-0.5">Nenhuma notificação no momento.</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.slice(0, 10).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => n.link && router.push(n.link)}
                      className="w-full text-left px-4 py-2.5 hover:bg-inset transition-colors flex gap-3"
                    >
                      <div className="mt-0.5">
                        {n.tipo.includes('vencen') ? (
                          <AlertCircle className="h-4 w-4 text-warn" />
                        ) : (
                          <Clock className="h-4 w-4 text-acao" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-tx-strong truncate">{n.titulo}</p>
                        <p className="text-xs text-tx-faint truncate">{n.corpo}</p>
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
