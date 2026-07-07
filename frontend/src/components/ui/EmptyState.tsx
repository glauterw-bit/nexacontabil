'use client';
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className ?? ''}`}>
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-inset border border-line flex items-center justify-center mb-4">
          <Icon className="h-5 w-5 text-tx-muted" />
        </div>
      )}
      <p className="text-sm font-semibold text-tx-strong">{title}</p>
      {description && <p className="text-xs text-tx-muted mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
