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
        <div className="h-12 w-12 rounded-full bg-[#161b2e] border border-[#1e2740] flex items-center justify-center mb-4">
          <Icon className="h-5 w-5 text-gray-500" />
        </div>
      )}
      <p className="text-sm font-medium text-white">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
