'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, ArrowLeftRight, Bot, Settings, ShieldCheck, Zap
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/documents', icon: FileText, label: 'Documentos' },
  { href: '/transactions', icon: ArrowLeftRight, label: 'Lançamentos' },
  { href: '/copilot', icon: Bot, label: 'Copilot IA' },
  { href: '/settings', icon: Settings, label: 'Configurações' },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-64 bg-surface-card border-r border-surface-border flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Aura</p>
            <p className="text-gray-500 text-xs">Accounting</p>
          </div>
        </div>
      </div>

      {/* Company selector */}
      <div className="px-4 py-4 border-b border-surface-border">
        <div className="bg-surface rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500">Empresa</p>
          <p className="text-sm text-white font-medium truncate">Empresa Demo Ltda</p>
          <p className="text-xs text-gray-500">CNPJ: 00.000.000/0001-00</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-brand-500/15 text-brand-500 border border-brand-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
              {href === '/copilot' && (
                <span className="ml-auto text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full">AI</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-surface-border">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          Trilha de auditoria ativa
        </div>
        <p className="text-xs text-gray-600 mt-1">Aura Accounting v1.0.0</p>
      </div>
    </aside>
  );
}
