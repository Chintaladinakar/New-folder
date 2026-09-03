import { ReactNode } from 'react';
import { Disc3 } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/50">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-4">
        {icon || <Disc3 className="w-8 h-8" />}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
