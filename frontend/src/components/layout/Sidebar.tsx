'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { useEffect, useState } from 'react';
import {
  Activity, Lightbulb, Sun, Briefcase, FolderTree, CalendarClock, MessageCircle,
  LayoutDashboard, Building2, ChevronDown, ChevronRight, Plus, LogOut, Zap,
  Settings, ShieldCheck, Users, Receipt, BarChart3, TrendingUp, Target,
  Banknote, ClipboardList, Landmark, Scale, Package, FileCode, FileText,
  UserCheck, Award, Globe, DollarSign, Megaphone, Store, Bot,
  Workflow, Boxes, FileDown, Inbox, Search, ArrowLeftRight, Hash,
} from 'lucide-react';
import { useCompany, Company } from '@/contexts/CompanyContext';
import { useAuth } from '@/contexts/AuthContext';

const GET_COMPANIES = gql`
  query GetCompanies {
    companies {
      id name cnpj taxRegime active
    }
  }
`;

interface NavItem { href: string; icon: any; label: string }
interface NavGroup { label: string; items: NavItem[] }

/* ── Navegação em eixos fixos (padrão dos líderes de practice management):
   7 itens de topo respondem a "o que eu faço agora?";
   o restante fica em grupos recolhíveis, fechados por padrão. ── */

const CORE_GESTOR: NavItem[] = [
  { href: '/operacao',     icon: Activity,      label: 'Operação' },
  { href: '/farois',       icon: Lightbulb,     label: 'Faróis' },
  { href: '/meu-dia',      icon: Sun,           label: 'Meu Dia' },
  { href: '/carteira',     icon: Briefcase,     label: 'Clientes' },
  { href: '/organizacao',  icon: FolderTree,    label: 'Documentos' },
  { href: '/prazos',       icon: CalendarClock, label: 'Prazos' },
  { href: '/atendimentos', icon: MessageCircle, label: 'Atendimento' },
];

const GROUPS_GESTOR: NavGroup[] = [
  {
    label: 'Gestão da carteira',
    items: [
      { href: '/gerencial',            icon: LayoutDashboard, label: 'Painel Gerencial' },
      { href: '/visao-geral',          icon: Building2,       label: 'Visão Geral' },
      { href: '/fluxo',                icon: Workflow,        label: 'Fluxo de Trabalho' },
      { href: '/produtividade',        icon: Users,           label: 'Produtividade' },
      { href: '/atribuir-responsavel', icon: UserCheck,       label: 'Atribuir Responsáveis' },
      { href: '/gestao-equipe',        icon: Users,           label: 'Gestão de Equipe' },
    ],
  },
  {
    label: 'Inteligência & Análise',
    items: [
      { href: '/insights',        icon: Boxes,          label: 'Insights de IA' },
      { href: '/inconsistencias', icon: ShieldCheck,    label: 'Inconsistências' },
      { href: '/apuracao',        icon: ClipboardList,  label: 'Apuração' },
      { href: '/solicitacoes',    icon: Inbox,          label: 'Solicitar Clientes' },
      { href: '/dashboard',       icon: Building2,      label: 'Painel do Cliente' },
      { href: '/copilot',         icon: Bot,            label: 'Copilot IA' },
      { href: '/benchmark',       icon: Target,         label: 'Benchmark' },
    ],
  },
  {
    label: 'Trabalho fiscal',
    items: [
      { href: '/buscar-docs',      icon: Search,    label: 'Buscar Documentos' },
      { href: '/captura-xml',      icon: Inbox,     label: 'Captura de XMLs' },
      { href: '/esteira-fiscal',   icon: Workflow,  label: 'Esteira Fiscal' },
      { href: '/ncm-inteligente',  icon: Boxes,     label: 'Banco de NCM' },
      { href: '/exportar-dominio', icon: FileDown,  label: 'Exportar p/ Domínio' },
      { href: '/simples-nacional', icon: Award,     label: 'Simples Nacional' },
      { href: '/sped',             icon: FileCode,  label: 'SPED / EFD' },
      { href: '/fiscal',           icon: Receipt,   label: 'NF-e / NFS-e' },
      { href: '/onvio',            icon: Building2, label: 'Onvio · Domínio' },
      { href: '/certidoes',        icon: ShieldCheck, label: 'Certidões' },
      { href: '/mei',              icon: Award,     label: 'MEI — DAS / DASN' },
    ],
  },
  {
    label: 'Folha & RH',
    items: [
      { href: '/folha',           icon: Users,     label: 'Folha de Pagamento' },
      { href: '/ferias-rescisao', icon: UserCheck, label: 'Férias / Rescisão' },
      { href: '/esocial',         icon: Briefcase, label: 'eSocial' },
    ],
  },
  {
    label: 'Contábil',
    items: [
      { href: '/relatorios/dre', icon: BarChart3,      label: 'DRE' },
      { href: '/balanco',        icon: Scale,          label: 'Balanço Patrimonial' },
      { href: '/transactions',   icon: ArrowLeftRight, label: 'Lançamentos' },
      { href: '/cashflow',       icon: TrendingUp,     label: 'Fluxo de Caixa' },
      { href: '/patrimonio',     icon: Package,        label: 'Patrimônio' },
      { href: '/fechamento',     icon: ShieldCheck,    label: 'Fechamento Mensal' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/boletos',    icon: Banknote,   label: 'Boletos' },
      { href: '/honorarios', icon: DollarSign, label: 'Honorários' },
      { href: '/banking',    icon: Landmark,   label: 'Open Finance' },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      { href: '/whatsapp',       icon: MessageCircle, label: 'WhatsApp IA' },
      { href: '/comunicados',    icon: Megaphone,     label: 'Comunicados' },
      { href: '/crm',            icon: Users,         label: 'CRM / Pipeline' },
      { href: '/portal-cliente', icon: Globe,         label: 'Portal do Cliente' },
    ],
  },
  {
    label: 'Escritório & Setup',
    items: [
      { href: '/onboarding-cliente', icon: Plus,           label: 'Novo Cliente' },
      { href: '/migracao',           icon: ArrowLeftRight, label: 'Migração em Massa' },
      { href: '/drive-conectado',    icon: Globe,          label: 'Drives Conectados' },
      { href: '/integracoes',        icon: Settings,       label: 'Integrações' },
      { href: '/tributario',         icon: Scale,          label: 'Plan. Tributário' },
      { href: '/reforma-tributaria', icon: Scale,          label: 'Reforma Tributária' },
      { href: '/abertura-empresa',   icon: Store,          label: 'Abertura de Empresa' },
      { href: '/audit',              icon: Hash,           label: 'Auditoria' },
      { href: '/guia',               icon: FileText,       label: 'Guia de Uso' },
    ],
  },
];

const CORE_ANALISTA: NavItem[] = [
  { href: '/meu-dia',         icon: Sun,           label: 'Meu Dia' },
  { href: '/atendimentos',    icon: MessageCircle, label: 'Atendimentos' },
  { href: '/prazos',          icon: CalendarClock, label: 'Meus Prazos' },
  { href: '/inconsistencias', icon: ShieldCheck,   label: 'Inconsistências' },
  { href: '/buscar-docs',     icon: Search,        label: 'Buscar Documentos' },
];
const GROUPS_ANALISTA: NavGroup[] = [
  {
    label: 'Operação fiscal',
    items: [
      { href: '/captura-xml',      icon: Inbox,    label: 'Captura de XMLs' },
      { href: '/esteira-fiscal',   icon: Workflow, label: 'Esteira Fiscal' },
      { href: '/exportar-dominio', icon: FileDown, label: 'Exportar p/ Domínio' },
      { href: '/ncm-inteligente',  icon: Boxes,    label: 'Banco de NCM' },
    ],
  },
  {
    label: 'Apoio',
    items: [
      { href: '/dashboard', icon: Building2, label: 'Painel do Cliente' },
      { href: '/copilot',   icon: Bot,       label: 'Copilot IA' },
      { href: '/guia',      icon: FileText,  label: 'Guia de Uso' },
    ],
  },
];

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

const OPEN_KEY = 'nexa_nav_open';

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { selectedCompany, setSelectedCompany } = useCompany();
  const { user, logout } = useAuth();
  const isAnalista = user?.role === 'analista';
  const coreNav = isAnalista ? CORE_ANALISTA : CORE_GESTOR;
  const groupsNav = isAnalista ? GROUPS_ANALISTA : GROUPS_GESTOR;

  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) || '{}');
      setOpen(saved);
    } catch {}
  }, []);
  const toggleGroup = (label: string) => {
    setOpen((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };
  const { data } = useQuery(GET_COMPANIES);
  const companies: Company[] = data?.companies ?? [];

  useEffect(() => {
    if (companies.length > 0 && !selectedCompany) {
      setSelectedCompany(companies[0]);
    }
    if (selectedCompany && companies.length > 0) {
      const found = companies.find(c => c.id === selectedCompany.id);
      if (!found) setSelectedCompany(companies[0]);
    }
  }, [companies]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const company = companies.find(c => c.id === e.target.value);
    if (company) setSelectedCompany(company);
  };

  const isActive = (href: string) => {
    if (href === '/relatorios/dre') return path.startsWith('/relatorios');
    return path === href || (href !== '/dashboard' && path.startsWith(href + '/'));
  };

  // Um grupo com item ativo abre automaticamente
  const groupHasActive = (g: NavGroup) => g.items.some(i => isActive(i.href));

  const navItemClass = (href: string) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
      isActive(href)
        ? 'bg-brand-600/10 text-acao dark:bg-brand-500/15'
        : 'text-tx-muted hover:text-tx-strong hover:bg-inset'
    }`;

  return (
    <aside className="w-60 bg-card border-r border-line flex flex-col flex-shrink-0 h-screen">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-tx-strong font-bold text-sm leading-none">Domo</p>
            <p className="text-tx-faint text-[11px] leading-tight">SYS</p>
          </div>
        </div>
      </div>

      {/* Seletor de cliente/empresa */}
      <div className="px-3 py-3 border-b border-line flex-shrink-0">
        {companies.length === 0 ? (
          <Link
            href="/onboarding-cliente"
            className="flex items-center gap-2 text-[13px] text-acao hover:opacity-80 transition-opacity py-1.5 px-1"
          >
            <Plus className="h-4 w-4" />
            Cadastrar primeiro cliente
          </Link>
        ) : (
          <div className="relative">
            <select
              value={selectedCompany?.id ?? ''}
              onChange={handleSelect}
              className="w-full bg-inset text-tx-strong text-[13px] border border-line rounded-lg pl-3 pr-8 py-2 appearance-none cursor-pointer focus:outline-none focus:border-acao transition-colors"
              title="Cliente em foco nas telas de empresa"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-tx-faint pointer-events-none" />
          </div>
        )}
        {selectedCompany && (
          <p className="mt-1.5 px-1 text-[11px] text-tx-faint font-mono">
            {formatCnpj(selectedCompany.cnpj)} · {selectedCompany.taxRegime?.replace(/_/g, ' ')}
          </p>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        <div className="space-y-0.5">
          {coreNav.map(({ href, icon: Icon, label }) => (
            <Link key={href} href={href} className={navItemClass(href)}>
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </div>

        <div className="mt-4 space-y-1">
          {groupsNav.map(group => {
            const expanded = open[group.label] || groupHasActive(group);
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-tx-faint font-semibold uppercase tracking-wider hover:text-tx-muted transition-colors"
                >
                  {expanded
                    ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
                  <span className="truncate">{group.label}</span>
                </button>
                {expanded && (
                  <div className="space-y-0.5 mb-2">
                    {group.items.map(({ href, icon: Icon, label }) => (
                      <Link key={href} href={href} className={navItemClass(href)}>
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Rodapé */}
      <div className="px-3 py-3 border-t border-line space-y-2 flex-shrink-0">
        <Link href="/settings" className={navItemClass('/settings')}>
          <Settings className="h-4 w-4 flex-shrink-0" />
          Configurações
        </Link>
        {user && (
          <div className="flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="text-xs text-tx-strong font-medium truncate max-w-[150px]">{user.name}</p>
              <p className="text-[11px] text-tx-faint truncate max-w-[150px]">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="text-tx-faint hover:text-err transition-colors p-1"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-tx-faint">
          <ShieldCheck className="h-3.5 w-3.5 text-ok" />
          Trilha de auditoria ativa
        </div>
      </div>
    </aside>
  );
}
