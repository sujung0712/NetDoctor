import type { CardProps } from '../types';

export function Card({
  title,
  subtitle,
  headerAction,
  children,
  className = '',
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || headerAction);

  return (
    <section
      className={`rounded-2xl bg-[#111b2e] border border-slate-800 shadow-card overflow-hidden ${className}`.trim()}
    >
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6 border-b border-slate-800/80 bg-[#142036]/60">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-base font-semibold text-slate-100 tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && (
            <div className="shrink-0 flex items-center gap-2">
              {headerAction}
            </div>
          )}
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
