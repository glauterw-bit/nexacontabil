'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { useEffect } from 'react';
import {
  LayoutDashboard, FileText, ArrowLeftRight, Bot,
  Settings, ShieldCheck, Zap, Building2, ChevronDown, Plus, MessageCircle, Hash, LogOut,
  Calendar, Users, Receipt, BarChart3, TrendingUp, Target, HeartPulse,
  Banknote, PenLine, ClipboardList, Landmark, Scale, Package, FileCode,
  Briefcase, UserCheck, Award, Globe, DollarSign, Kanban, Megaphone, Store,
  Workflow, Boxes, FileDown, Gauge, Inbox, Search, FolderTree
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

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── GESTÃO — visão do gestor (topo, fixo, prioridade máxima) ──
const NAV_MAIN: NavItem[] = [
  { href: '/gerencial',       icon: LayoutDashboard, label: 'Painel Gerencial',  badge: 'Novo' },
  { href: '/meu-dia',         icon: Gauge,           label: 'Meu Dia',           badge: 'Hoje' },
  { href: '/torre-controle',  icon: Gauge,           label: 'Torre de Controle', badge: 'Gestor' },
  { href: '/visao-geral',     icon: Building2,       label: 'Visão Geral',       badge: 'Admin' },
  { href: '/dashboard',       icon: Building2,       label: 'Painel do Cliente' },
  { href: '/inconsistencias', icon: ShieldCheck,     label: 'Inconsistências',   badge: 'Malha' },
  { href: '/insights',        icon: Boxes,           label: 'Insights de IA',    badge: 'IA' },
  { href: '/organizacao',     icon: FolderTree,      label: 'Organização Docs',  badge: 'Novo' },
  { href: '/apuracao',        icon: ClipboardList,   label: 'Apuração',          badge: 'Fiscal' },
  { href: '/solicitacoes',    icon: Inbox,           label: 'Solicitar Clientes', badge: 'Pendências' },
  { href: '/prazos',          icon: ClipboardList,   label: 'Prazos & SLA' },
  { href: '/produtividade',   icon: Users,           label: 'Produtividade' },
  { href: '/atribuir-responsavel', icon: UserCheck,  label: 'Atribuir Responsáveis' },
  { href: '/kanban',          icon: Kanban,          label: 'Kanban da Equipe' },
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: '⚡ Trabalho do Analista',
    items: [
      { href: '/buscar-docs',     icon: Search,        label: 'Buscar Documentos', badge: 'IA' },
      { href: '/captura-xml',     icon: Inbox,         label: 'Captura de XMLs',   badge: 'Fiscal' },
      { href: '/esteira-fiscal',  icon: Workflow,      label: 'Esteira Fiscal',    badge: 'Auto' },
      { href: '/risco-fiscal',    icon: ShieldCheck,   label: 'Risco Fiscal',      badge: 'AI' },
      { href: '/ncm-inteligente', icon: Boxes,         label: 'Banco de NCM',      badge: 'IA' },
      { href: '/exportar-dominio', icon: FileDown,     label: 'Exportar p/ Domínio' },
      { href: '/copilot',         icon: Bot,           label: 'Copilot IA',        badge: 'AI' },
    ],
  },
  {
    label: 'Fiscal — Apuração & Entrega',
    items: [
      { href: '/obrigacoes',      icon: ClipboardList, label: 'Obrigações' },
      { href: '/simples-nacional',icon: Award,         label: 'Simples Nacional' },
      { href: '/sped',            icon: FileCode,      label: 'SPED / EFD' },
      { href: '/fiscal',          icon: Receipt,       label: 'NF-e / NFS-e' },
      { href: '/onvio',           icon: Building2,     label: 'Onvio · Domínio', badge: 'TR' },
      { href: '/certidoes',       icon: ShieldCheck,   label: 'Certidões' },
    ],
  },
  {
    label: 'Carteira & Implantação',
    items: [
      { href: '/carteira',           icon: Briefcase,     label: 'Carteira',        badge: 'Live' },
      { href: '/onboarding-cliente', icon: Building2,     label: 'Onboarding Cliente' },
      { href: '/companies',          icon: Building2,     label: 'Empresas' },
      { href: '/migracao',           icon: ArrowLeftRight,label: 'Migração em Massa' },
      { href: '/drive-conectado',    icon: Globe,         label: 'Drives Conectados' },
      { href: '/integracoes',        icon: Settings,      label: 'Integrações', badge: 'Setup' },
    ],
  },
  {
    label: 'Gestão & Relacionamento',
    items: [
      { href: '/audit',           icon: Hash,          label: 'Auditoria' },
      { href: '/atendimentos',    icon: MessageCircle, label: 'Central de Atendimento', badge: 'MEGA' },
      { href: '/whatsapp',        icon: MessageCircle, label: 'WhatsApp IA',  badge: 'WA' },
      { href: '/comunicados',     icon: Megaphone,     label: 'Comunicados' },
      { href: '/crm',             icon: Users,         label: 'CRM / Pipeline' },
      { href: '/portal-cliente',  icon: Globe,         label: 'Portal do Cliente' },
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
      { href: '/relatorios/dre',  icon: BarChart3,    label: 'DRE' },
      { href: '/balanco',         icon: Scale,        label: 'Balanço Patrimonial' },
      { href: '/transactions',    icon: ArrowLeftRight, label: 'Lançamentos' },
      { href: '/cashflow',        icon: TrendingUp,   label: 'Fluxo de Caixa' },
      { href: '/patrimonio',      icon: Package,      label: 'Patrimônio' },
      { href: '/fechamento',      icon: ShieldCheck,  label: 'Fechamento Mensal' },
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
    label: 'Consultoria & Tributário',
    items: [
      { href: '/tributario',     icon: Scale,      label: 'Plan. Tributário' },
      { href: '/reforma-tributaria', icon: Scale,  label: 'Reforma Tributária', badge: 'CBS/IBS' },
      { href: '/benchmark',      icon: Target,     label: 'Benchmark' },
      { href: '/saude-fiscal',   icon: HeartPulse, label: 'Saúde Fiscal' },
      { href: '/abertura-empresa', icon: Store,    label: 'Abertura de Empresa' },
      { href: '/mei',            icon: Award,      label: 'MEI — DAS / DASN' },
      { href: '/guia',           icon: FileText,   label: 'Guia de Uso' },
      { href: '/settings',       icon: Settings,   label: 'Configurações' },
    ],
  },
];

// ── Visão do ANALISTA — só o fluxo dele ──
const NAV_MAIN_ANALISTA: NavItem[] = [
  { href: '/meu-dia',       icon: Gauge,         label: 'Meu Dia',           badge: 'Hoje' },
  { href: '/atendimentos',  icon: MessageCircle, label: 'Atendimentos',      badge: 'WA' },
  { href: '/prazos',        icon: ClipboardList, label: 'Meus Prazos' },
  { href: '/inconsistencias', icon: ShieldCheck, label: 'Inconsistências',   badge: 'Malha' },
  { href: '/buscar-docs',   icon: Search,        label: 'Buscar Documentos', badge: 'IA' },
];
const NAV_GROUPS_ANALISTA: NavGroup[] = [
  {
    label: 'Operação Fiscal',
    items: [
      { href: '/captura-xml',     icon: Inbox,     label: 'Captura de XMLs' },
      { href: '/esteira-fiscal',  icon: Workflow,  label: 'Esteira Fiscal' },
      { href: '/exportar-dominio', icon: FileDown, label: 'Exportar p/ Domínio' },
      { href: '/ncm-inteligente', icon: Boxes,     label: 'Banco de NCM' },
      { href: '/risco-fiscal',    icon: ShieldCheck, label: 'Risco Fiscal' },
    ],
  },
  {
    label: 'Apoio',
    items: [
      { href: '/dashboard',  icon: Building2, label: 'Painel do Cliente' },
      { href: '/copilot',    icon: Bot,       label: 'Copilot IA' },
      { href: '/guia',       icon: FileText,  label: 'Guia de Uso' },
      { href: '/settings',   icon: Settings,  label: 'Configurações' },
    ],
  },
];

function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { selectedCompany, setSelectedCompany } = useCompany();
  const { user, logout } = useAuth();
  const isAnalista = user?.role === 'analista';
  const mainNav = isAnalista ? NAV_MAIN_ANALISTA : NAV_MAIN;
  const groupsNav = isAnalista ? NAV_GROUPS_ANALISTA : NAV_GROUPS;

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
    if (company) {
      setSelectedCompany(company);
      router.push('/dashboard');
    }
  };

  const isActive = (href: string) => {
    if (href === '/relatorios/dre') return path.startsWith('/relatorios');
    return path === href || (href !== '/dashboard' && path.startsWith(href + '/'));
  };

  const navItemClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive(href)
        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
    }`;

  return (
    <aside className="w-64 bg-[#161b2e] border-r border-[#1e2740] flex flex-col flex-shrink-0 h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#1e2740] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Domo</p>
            <p className="text-gray-500 text-xs">SYS</p>
          </div>
        </div>
      </div>

      {/* Company Selector */}
      <div className="px-4 py-4 border-b border-[#1e2740] flex-shrink-0">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Cliente / Empresa</p>
        {companies.length === 0 ? (
          <Link
            href="/companies"
            className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors py-2"
          >
            <Plus className="h-4 w-4" />
            Cadastrar primeiro cliente
          </Link>
        ) : (
          <div className="relative">
            <select
              value={selectedCompany?.id ?? ''}
              onChange={handleSelect}
              className="w-full bg-[#0f1117] text-white text-sm border border-[#1e2740] rounded-lg px-3 py-2.5 pr-8 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        )}

        {selectedCompany && (
          <div className="mt-2 px-1">
            <p className="text-xs text-gray-500 font-mono">
              {formatCnpj(selectedCompany.cnpj)}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{selectedCompany.taxRegime.replace('_', ' ')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
        {/* Main nav items */}
        {mainNav.map(({ href, icon: Icon, label, badge }) => (
          <Link key={href} href={href} className={navItemClass(href)}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
            {badge && (
              <span className="ml-auto text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                {badge}
              </span>
            )}
          </Link>
        ))}

        {/* Grouped nav items */}
        {groupsNav.map(group => (
          <div key={group.label} className="pt-3">
            <p className="px-3 text-xs text-gray-600 font-medium uppercase tracking-wider mb-1">
              {group.label}
            </p>
            {group.items.map(({ href, icon: Icon, label, badge }) => (
              <Link key={href} href={href} className={navItemClass(href)}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{label}</span>
                {badge && (
                  <span className="ml-auto text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[#1e2740] space-y-3 flex-shrink-0">
        {user && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white font-medium truncate max-w-[120px]">{user.name}</p>
              <p className="text-xs text-gray-600 truncate max-w-[120px]">{user.email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="text-gray-600 hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          Trilha de auditoria ativa
        </div>
        <p className="text-xs text-gray-700">DomoSYS v1.0.0</p>
      </div>
    </aside>
  );
}
