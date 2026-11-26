import type { ButtonProps } from '../types';

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-semibold border border-cyan-400/40 shadow-sm shadow-cyan-500/20',
  secondary:
    'bg-[#162238] hover:bg-[#1e2f4d] active:bg-[#111b2e] text-slate-100 font-medium border border-slate-700 hover:border-slate-600',
  ghost:
    'bg-transparent hover:bg-slate-800/75 active:bg-slate-800 text-slate-200 hover:text-white font-medium border border-transparent',
  danger:
    'bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 text-rose-200 font-semibold border border-rose-500/40 hover:border-rose-400/60',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`.trim()}
      {...rest}
    >
      {leftIcon && (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      <span>{children}</span>
    </button>
  );
}
