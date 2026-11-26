import { Inbox } from 'lucide-react';
import type { EmptyStateProps } from '../types';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-2xl bg-[#111b2e] border border-dashed border-slate-700/90 px-6 py-12">
      <div
        className="w-12 h-12 rounded-2xl bg-[#162238] border border-slate-700/80 flex items-center justify-center text-cyan-400 mb-4"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400 mt-1.5 max-w-md leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
