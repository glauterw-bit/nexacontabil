'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { useEffect, useState } from 'react';
import {
  Activity, Briefcase, CalendarClock, LayoutDashboard, ChevronDown, ChevronRight,
  Plus, LogOut, Zap, Settings, ShieldCheck, Receipt, ClipboardList, Landmark,
  FileText, UserCheck, Globe, FileDown, Inbox, Search, FolderTree,
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
interface Step { n: number; label: string; cor: string; items: NavItem[] }
interface NavGroup { label: string; items: NavItem[] }

/* ── Navegação como CAMINHO DE TRABALHO ──
   Visão no topo, depois o fluxo do mês em 5 etapas numeradas
   (receber → processar → apurar → entregar → comunicar),
   clientes, e módulos avançados recolhidos. ── */

/* ── NÚCLEO (a base provada: leitura por enumeração + reconciliação com prova).
   Navegação enxuta e orientada ao FLUXO REAL do escritório. Telas do modelo antigo
   (mock/estáticas/redundantes) saem do menu — rotas preservadas, reversível via git. ── */

// ADMIN / GESTOR — visão macro da carteira
const VISAO: NavItem[] = [
  { href: '/central-entregas', icon: CalendarClock, label: 'Central de Entregas' },
  { href: '/cobertura',        icon: ShieldCheck,   label: 'Cobertura (prova)' },
  { href: '/gerencial',        icon: Activity,      label: 'Desempenho da equipe' },
];

const CAMINHO: Step[] = [
  {
    n: 1, label: 'Receber', cor: '#6cb2ff',
    items: [
      { href: '/captura-xml',  icon: Inbox,         label: 'Captura de XMLs' },
      { href: '/solicitacoes', icon: ClipboardList, label: 'Solicitar Clientes' },
    ],
  },
  {
    n: 2, label: 'Conferir', cor: '#a78bfa',
    items: [
      { href: '/explorador',  icon: FolderTree, label: 'Explorador de Pastas' },
      { href: '/buscar-docs', icon: Search,     label: 'Buscar Documentos' },
    ],
  },
  {
    n: 3, label: 'Cobrar', cor: '#ffc247',
    items: [
      { href: '/recibos-faltantes', icon: CalendarClock, label: 'Recibos Faltantes' },
    ],
  },
  {
    n: 4, label: 'Entregar', cor: '#3ee0a0',
    items: [
      { href: '/exportar-dominio', icon: FileDown, label: 'Exportar p/ Domínio' },
    ],
  },
];

const CLIENTES: NavItem[] = [
  { href: '/carteira',           icon: Briefcase, label: 'Carteira de Clientes' },
  { href: '/atribuir-responsavel', icon: UserCheck, label: 'Gestão de Carteira' },
  { href: '/onboarding-cliente', icon: Plus,      label: 'Novo Cliente' },
];

const MODULOS: NavGroup[] = [
  {
    label: 'Fiscal (apoio à base)',
    items: [
      { href: '/sefaz',     icon: Landmark,    label: 'Buscar no SEFAZ' },
      { href: '/certidoes', icon: ShieldCheck, label: 'Certidões' },
      { href: '/fiscal',    icon: Receipt,     label: 'NF-e / NFS-e' },
    ],
  },
  {
    label: 'Fonte & Setup',
    items: [
      { href: '/drive-conectado',   icon: Globe,      label: 'Drives Conectados' },
      { href: '/verificacao-final', icon: ShieldCheck, label: 'Verificação Final' },
      { href: '/integracoes',       icon: Settings,   label: 'Integrações' },
      { href: '/guia',              icon: FileText,   label: 'Guia de Uso' },
    ],
  },
  {
    label: 'Legado (em revisão)',
    items: [
      { href: '/painel',   icon: LayoutDashboard, label: 'Painel antigo' },
      { href: '/operacao', icon: Activity,        label: 'Operação (detalhe)' },
      { href: '/apuracao', icon: ClipboardList,   label: 'Apuração' },
      { href: '/inconsistencias', icon: ShieldCheck, label: 'Inconsistências' },
    ],
  },
];

// ── ANALISTA — foco total na PRÓPRIA carteira (painéis escopados no back-end pelo nome do login) ──
const VISAO_ANALISTA: NavItem[] = [
  { href: '/meu-dia',           icon: Activity,      label: 'Meu Dia' },
  { href: '/central-entregas',  icon: CalendarClock, label: 'Minha Central' },
  { href: '/cobertura',         icon: ShieldCheck,   label: 'Minha Cobertura' },
];
const CAMINHO_ANALISTA: Step[] = [
  { n: 1, label: 'Receber',  cor: '#6cb2ff', items: [{ href: '/captura-xml', icon: Inbox, label: 'Captura de XMLs' }] },
  { n: 2, label: 'Conferir', cor: '#a78bfa', items: [
    { href: '/explorador',  icon: FolderTree, label: 'Explorador de Pastas' },
    { href: '/buscar-docs', icon: Search,     label: 'Buscar Documentos' },
  ] },
  { n: 3, label: 'Entregar', cor: '#3ee0a0', items: [{ href: '/exportar-dominio', icon: FileDown, label: 'Exportar p/ Domínio' }] },
];
const MODULOS_ANALISTA: NavGroup[] = [
  {
    label: 'Apoio',
    items: [
      { href: '/carteira', icon: Briefcase, label: 'Meus Clientes' },
      { href: '/guia',     icon: FileText,  label: 'Guia de Uso' },
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
  const visao = isAnalista ? VISAO_ANALISTA : VISAO;
  const caminho = isAnalista ? CAMINHO_ANALISTA : CAMINHO;
  const modulos = isAnalista ? MODULOS_ANALISTA : MODULOS;

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [avancado, setAvancado] = useState(false);
  useEffect(() => {
    try { setOpen(JSON.parse(localStorage.getItem(OPEN_KEY) || '{}')); } catch {}
    try { setAvancado(localStorage.getItem('nexa_nav_avancado') === '1'); } catch {}
  }, []);
  const toggleAvancado = () => {
    setAvancado((v) => {
      try { localStorage.setItem('nexa_nav_avancado', v ? '0' : '1'); } catch {}
      return !v;
    });
  };
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
  const groupHasActive = (items: NavItem[]) => items.some(i => isActive(i.href));

  const Item = ({ href, icon: Icon, label }: NavItem) => {
    const active = isActive(href);
    return (
      <Link href={href}
        className={`relative flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
          active ? 'text-tx-strong' : 'text-tx-muted hover:text-tx-strong hover:bg-inset'
        }`}
        style={active ? { background: 'linear-gradient(90deg, color-mix(in srgb, var(--acao) 22%, transparent), color-mix(in srgb, var(--acao) 5%, transparent))' } : undefined}>
        {active && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 99, background: 'var(--acao)' }} />}
        <Icon className="h-4 w-4 flex-shrink-0" style={{ color: active ? 'var(--acao)' : undefined, opacity: active ? 1 : 0.85 }} />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const Rotulo = ({ children }: { children: React.ReactNode }) => (
    <p className="px-3 pt-4 pb-1 text-[10.5px] text-tx-faint font-bold uppercase tracking-[0.08em]">{children}</p>
  );

  return (
    <aside className="w-[248px] bg-card border-r border-line flex flex-col flex-shrink-0 h-screen">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-line flex-shrink-0"
        style={{ backgroundImage: 'linear-gradient(135deg, color-mix(in srgb, var(--acao) 10%, transparent), transparent 60%)' }}>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 2px 10px color-mix(in srgb, var(--acao) 45%, transparent)' }}>
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
      <nav className="flex-1 px-2.5 py-2 overflow-y-auto">
        <Rotulo>Visão</Rotulo>
        <div className="space-y-0.5">
          {visao.map((it) => <Item key={it.href} {...it} />)}
        </div>

        <Rotulo>Caminho do mês</Rotulo>
        <div style={{ marginLeft: 13, borderLeft: '1px solid var(--border-soft)', paddingLeft: 2 }}>
          {caminho.map((step) => (
            <div key={step.n} style={{ paddingBottom: 4 }}>
              <div className="flex items-center gap-2 py-1" style={{ marginLeft: -13 }}>
                <span className="flex items-center justify-center flex-shrink-0"
                  style={{ height: 22, width: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, background: `color-mix(in srgb, ${step.cor} 16%, var(--surface))`, color: step.cor, border: `1px solid color-mix(in srgb, ${step.cor} 40%, transparent)` }}>
                  {step.n}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{step.label}</span>
              </div>
              <div className="space-y-0.5">
                {step.items.map((it) => <Item key={it.href} {...it} />)}
              </div>
            </div>
          ))}
        </div>

        {!isAnalista && (
          <>
            <Rotulo>Clientes</Rotulo>
            <div className="space-y-0.5">
              {CLIENTES.map((it) => <Item key={it.href} {...it} />)}
            </div>
          </>
        )}

        {/* Módulos avançados: fora do caminho diário — visíveis só sob demanda
            (ou quando a rota atual pertence a um deles) */}
        <button onClick={toggleAvancado}
          className="w-full flex items-center gap-1.5 px-3 mt-4 py-1.5 text-[11px] text-tx-faint font-semibold uppercase tracking-[0.06em] hover:text-tx-muted transition-colors">
          {avancado ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Módulos avançados
          <span className="ml-auto normal-case font-normal">{modulos.reduce((s, g) => s + g.items.length, 0)}</span>
        </button>
        <div className="space-y-0.5">
          {modulos.filter(group => avancado || groupHasActive(group.items)).map(group => {
            const expanded = open[group.label] || groupHasActive(group.items);
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] text-tx-muted font-medium hover:text-tx-strong hover:bg-inset rounded-lg transition-colors"
                >
                  {expanded
                    ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-tx-faint" />
                    : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-tx-faint" />}
                  <span className="truncate">{group.label}</span>
                  <span className="ml-auto text-[10.5px] text-tx-faint">{group.items.length}</span>
                </button>
                {expanded && (
                  <div className="space-y-0.5 mb-1.5 ml-2">
                    {group.items.map((it) => <Item key={it.href} {...it} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Rodapé */}
      <div className="px-3 py-3 border-t border-line space-y-2 flex-shrink-0">
        <Item href="/settings" icon={Settings} label="Configurações" />
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
