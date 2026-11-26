import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { AlertBannerProps } from '../types';

type AlertTone = NonNullable<AlertBannerProps['tone']>;

const TONE_CONFIG: Record<
  AlertTone,
  {
    container: string;
    iconColor: string;
    titleColor: string;
    Icon: typeof Info;
    role: 'status' | 'alert';
  }
> = {
  cyan: {
    container: 'bg-cyan-500/10 border-cyan-500/35 text-slate-200',
    iconColor: 'text-cyan-300',
    titleColor: 'text-cyan-100',
    Icon: Info,
    role: 'status',
  },
  success: {
    container: 'bg-emerald-500/10 border-emerald-500/35 text-slate-200',
    iconColor: 'text-emerald-300',
    titleColor: 'text-emerald-100',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    container: 'bg-amber-500/10 border-amber-500/35 text-slate-200',
    iconColor: 'text-amber-300',
    titleColor: 'text-amber-100',
    Icon: AlertTriangle,
    role: 'alert',
  },
  danger: {
    container: 'bg-rose-500/10 border-rose-500/40 text-slate-200',
    iconColor: 'text-rose-300',
    titleColor: 'text-rose-100',
    Icon: AlertOctagon,
    role: 'alert',
  },
};

export function AlertBanner({
  tone = 'cyan',
  title,
  description,
  className = '',
}: AlertBannerProps) {
  const { container, iconColor, titleColor, Icon, role } = TONE_CONFIG[tone];

  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${container} ${className}`.trim()}
    >
      <Icon
        className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-5 ${titleColor}`}>
          {title}
        </p>
        {description && (
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
