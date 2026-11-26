import type { BadgeProps, ComponentTone } from '../types';

const TONE_CLASSES: Record<ComponentTone, string> = {
  neutral: 'bg-slate-800/90 text-slate-200 border-slate-700/90',
  cyan: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/35',
  success: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35',
  warning: 'bg-amber-500/15 text-amber-200 border-amber-500/35',
  danger: 'bg-rose-500/15 text-rose-200 border-rose-500/35',
};

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 tracking-tight ${TONE_CLASSES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
