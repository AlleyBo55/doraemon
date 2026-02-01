import type { FunctionalComponent } from 'preact';

type SpinnerSize = 'sm' | 'md' | 'lg';

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

const SIZE_MAP: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export const Spinner: FunctionalComponent<SpinnerProps> = ({
  size = 'md',
  className = '',
}) => (
  <svg
    class={`animate-spin ${SIZE_MAP[size]} ${className}`}
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle
      class="opacity-20"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="3"
    />
    <path
      class="opacity-80"
      d="M12 2a10 10 0 0 1 10 10"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
  </svg>
);
