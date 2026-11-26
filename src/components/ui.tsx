import type {
  AlertBannerProps,
  BadgeProps,
  ButtonProps,
  CardProps,
  CopyCodeBlockProps,
  EmptyStateProps,
  ModalProps,
  SearchInputProps,
} from '../types';

export function Button({ children, ...rest }: ButtonProps) {
  return <button {...rest}>{children}</button>;
}

export function Badge({ children, className = '' }: BadgeProps) {
  return <span className={className}>{children}</span>;
}

export function Card({ title, subtitle, headerAction, children, className = '' }: CardProps) {
  return (
    <section className={className}>
      {(title || subtitle || headerAction) && (
        <div>
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
          {headerAction}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ isOpen, title, children, footer }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={title}>
      <h3>{title}</h3>
      <div>{children}</div>
      {footer}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, ariaLabel, maxLength }: SearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? '검색'}
      maxLength={maxLength}
    />
  );
}

export function CopyCodeBlock({ code, label }: CopyCodeBlockProps) {
  return (
    <div>
      {label && <span>{label}</span>}
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function AlertBanner({ title, description }: AlertBannerProps) {
  return (
    <div role="status">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  );
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
