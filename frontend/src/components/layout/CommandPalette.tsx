'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, X } from 'lucide-react';

interface Item {
  group: string;
  label: string;
  href: string;
  keywords?: string[];
}

const COMMANDS: Item[] = [
  // Principal
  { group: 'Principal', label: 'Dashboard', href: '/dashboard', keywords: ['inicio', 'home', 'visão geral'] },
  { group: 'Principal', label: 'Documentos', href: '/documents', keywords: ['nota', 'xml', 'pdf', 'upload'] },
  { group: 'Principal', label: 'Analise em Lote (IA)', href: '/inteligencia', keywords: ['pasta', 'rede', 'batch', 'ocr', 'ia'] },
  { group: 'Principal', label: 'Busca IA em documentos', href: '/buscar', keywords: ['procurar', 'achar', 'localizar', 'imposto', '2023', 'empresa'] },
  { group: 'Principal', label: 'Instalar Agent Desktop', href: '/agent', keywords: ['baixar', 'download', 'desktop', 'electron', 'windows'] },
  { group: 'Principal', label: 'Lançamentos contábeis', href: '/transactions', keywords: ['lcto', 'debito', 'credito', 'partida'] },
  { group: 'Principal', label: 'Empresas / Clientes', href: '/companies', keywords: ['cnpj', 'cliente', 'empresa', 'novo cliente'] },

  // Contabilidade
  { group: 'Contabilidade', label: 'Plano de contas', href: '/companies?focus=chart', keywords: ['contas', 'pcasp', 'conta contabil'] },
  { group: 'Contabilidade', label: 'DRE', href: '/relatorios/dre', keywords: ['demonstrativo', 'resultado'] },
  { group: 'Contabilidade', label: 'Balanço Patrimonial', href: '/relatorios/balanco', keywords: ['ativo', 'passivo', 'pl'] },
  { group: 'Contabilidade', label: 'Folha de Pagamento', href: '/folha', keywords: ['holerite', 'inss', 'irrf', 'fgts'] },
  { group: 'Contabilidade', label: 'Patrimônio / Imobilizado', href: '/patrimonio', keywords: ['ativo', 'depreciacao'] },

  // Fiscal
  { group: 'Fiscal', label: 'NF-e / NFS-e', href: '/fiscal', keywords: ['nota fiscal'] },
  { group: 'Fiscal', label: 'SPED / EFD', href: '/sped', keywords: ['icms', 'ipi', 'contribuicoes'] },
  { group: 'Fiscal', label: 'eSocial', href: '/esocial', keywords: ['s-1000', 's-1200', 'trabalhista'] },
  { group: 'Fiscal', label: 'Simples Nacional', href: '/simples-nacional', keywords: ['das', 'pgdas'] },
  { group: 'Fiscal', label: 'Agenda Fiscal', href: '/agenda', keywords: ['calendario', 'obrigacao', 'das', 'darf', 'gps', 'fgts'] },
  { group: 'Fiscal', label: 'Obrigações Acessórias', href: '/obrigacoes', keywords: ['dctfweb', 'reinf', 'ecd', 'ecf'] },
  { group: 'Fiscal', label: 'Certidões Negativas', href: '/certidoes', keywords: ['cnd', 'fgts', 'trabalhista'] },
  { group: 'Fiscal', label: 'MEI', href: '/mei', keywords: ['das-simei', 'dasn-simei'] },

  // Financeiro
  { group: 'Financeiro', label: 'Boletos', href: '/boletos', keywords: ['cobranca', 'pagamento'] },
  { group: 'Financeiro', label: 'Fluxo de Caixa', href: '/cashflow', keywords: ['dfc', 'caixa'] },
  { group: 'Financeiro', label: 'Open Finance / Bancos', href: '/banking', keywords: ['extrato', 'banco', 'conta'] },
  { group: 'Financeiro', label: 'Honorários', href: '/honorarios', keywords: ['cobrar', 'mensalidade'] },

  // Gestão
  { group: 'Escritório', label: 'CRM / Pipeline', href: '/crm', keywords: ['lead', 'prospect'] },
  { group: 'Escritório', label: 'Tarefas (Kanban)', href: '/tarefas', keywords: ['todo', 'kanban'] },
  { group: 'Escritório', label: 'Comunicados', href: '/comunicados', keywords: ['aviso', 'circular'] },
  { group: 'Escritório', label: 'Abertura de Empresa', href: '/abertura-empresa', keywords: ['nova empresa'] },

  // Inteligência
  { group: 'Inteligência', label: 'Copilot IA', href: '/copilot', keywords: ['ia', 'ai', 'claude'] },
  { group: 'Inteligência', label: 'Planejamento Tributário', href: '/tributario', keywords: ['regime', 'simulacao'] },
  { group: 'Inteligência', label: 'Saúde Fiscal', href: '/saude-fiscal', keywords: ['score', 'risco'] },
  { group: 'Inteligência', label: 'Benchmark', href: '/benchmark', keywords: ['comparacao', 'setor'] },

  // Outros
  { group: 'Sistema', label: 'Portal do Cliente', href: '/portal-cliente' },
  { group: 'Sistema', label: 'Auditoria', href: '/audit', keywords: ['log', 'historico'] },
  { group: 'Sistema', label: 'Configurações', href: '/settings', keywords: ['perfil', '2fa', 'tema'] },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!q.trim()) return COMMANDS;
    const needle = q.toLowerCase().trim();
    return COMMANDS.filter((c) => {
      if (c.label.toLowerCase().includes(needle)) return true;
      if (c.group.toLowerCase().includes(needle)) return true;
      return (c.keywords || []).some((k) => k.toLowerCase().includes(needle));
    });
  }, [q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  function pick(item: Item) {
    router.push(item.href);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIdx]) {
      e.preventDefault();
      pick(filtered[activeIdx]);
    }
  }

  if (!open) return null;

  // group filtered items
  const groups: { name: string; items: Item[] }[] = [];
  for (const item of filtered) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) {
      g = { name: item.group, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  // flat order for keyboard nav
  let flatIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-[#161b2e] border border-[#2a3550] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e2740]">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar páginas, ações, módulos..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
          />
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Nenhum resultado para <span className="text-gray-300">"{q}"</span>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-2">
                <p className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
                  {g.name}
                </p>
                {g.items.map((item) => {
                  flatIdx++;
                  const active = flatIdx === activeIdx;
                  return (
                    <button
                      key={item.href + item.label}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onClick={() => pick(item)}
                      className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                        active ? 'bg-indigo-600/20 text-white' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{item.label}</span>
                      {active && <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-[#1e2740] text-xs text-gray-600 flex items-center gap-4">
          <span><kbd className="text-gray-500">↑↓</kbd> navegar</span>
          <span><kbd className="text-gray-500">Enter</kbd> abrir</span>
          <span><kbd className="text-gray-500">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}
