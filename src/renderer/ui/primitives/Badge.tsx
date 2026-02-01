import type { FunctionalComponent, JSX } from 'preact';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

type BadgeProps = {
  variant?: BadgeVariant;
  children: JSX.Element | string;
  className?: string;
};

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
};

export const Badge: FunctionalComponent<BadgeProps> = ({
  variant = 'default',
  children,
  className = '',
}) => (
  <span
    class={`
      inline-flex items-center px-2 py-0.5
      text-xs font-medium rounded-full
      ${VARIANT_STYLES[variant]}
      ${className}
    `}
  >
    {children}
  </span>
);
