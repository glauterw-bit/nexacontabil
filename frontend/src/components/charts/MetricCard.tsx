import { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  delta: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'yellow' | 'purple';
}

const colorMap = {
  blue:   { bg: 'bg-blue-500/10',   icon: 'text-blue-400',   delta: 'text-blue-400' },
  green:  { bg: 'bg-green-500/10',  icon: 'text-green-400',  delta: 'text-green-400' },
  yellow: { bg: 'bg-yellow-500/10', icon: 'text-yellow-400', delta: 'text-yellow-400' },
  purple: { bg: 'bg-purple-500/10', icon: 'text-purple-400', delta: 'text-purple-400' },
};

export function MetricCard({ label, value, delta, icon: Icon, color }: Props) {
  const c = colorMap[color];
  const positive = !delta.startsWith('-');
  return (
    <div className="card-aura flex items-start justify-between gap-4">
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        <p className={`text-xs mt-1 ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {delta} vs. período anterior
        </p>
      </div>
      <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`h-5 w-5 ${c.icon}`} />
      </div>
    </div>
  );
}
