import type { FunctionalComponent, JSX } from 'preact';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
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
  primary: 'bg-dora-blue text-white hover:bg-dora-blue-dark active:scale-[0.98]',
  secondary: 'bg-white/80 text-slate-800 border border-slate-200 hover:bg-white active:scale-[0.98]',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:scale-[0.98]',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
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
        inline-flex items-center justify-center gap-2
        font-medium transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-dora-blue/40 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
    >
      {loading && (
        <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle
            class="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="3"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
};
