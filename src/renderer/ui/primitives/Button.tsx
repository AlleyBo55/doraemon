import type { FunctionalComponent, JSX } from 'preact';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: JSX.Element | string;
  className?: string;
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-dora-blue text-white shadow-sm hover:brightness-105 active:brightness-95',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-200/80',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-100/80',
  destructive: 'bg-red-500 text-white shadow-sm hover:brightness-105 active:brightness-95',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[12px] rounded-md',
  md: 'h-8 px-4 text-[13px] rounded-lg',
  lg: 'h-10 px-5 text-[14px] rounded-lg',
};

export const Button: FunctionalComponent<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  children,
  className = '',
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      class={`
        inline-flex items-center justify-center gap-1.5
        font-medium transition-all duration-100
        focus:outline-none focus-visible:ring-2 focus-visible:ring-dora-blue/50 focus-visible:ring-offset-1
        disabled:opacity-40 disabled:pointer-events-none
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
    >
      {loading && (
        <svg class="animate-spin w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <circle class="opacity-25" cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" />
          <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
};
