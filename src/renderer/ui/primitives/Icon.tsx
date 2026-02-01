import type { FunctionalComponent } from 'preact';

type IconName = 'check' | 'x' | 'loader' | 'alert' | 'info' | 'chevron';
type IconSize = 'sm' | 'md' | 'lg';

type IconProps = {
  name: IconName;
  size?: IconSize;
  className?: string;
};

const SIZE_MAP: Record<IconSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const PATHS: Record<IconName, string> = {
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M6 18L18 6',
  loader: 'M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.31 0l-2.83-2.83M9.76 9.76L6.93 6.93',
  alert: 'M12 9v4m0 4h.01M12 3l9 16H3L12 3z',
  info: 'M12 16v-4m0-4h.01M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
  chevron: 'M9 5l7 7-7 7',
};

export const Icon: FunctionalComponent<IconProps> = ({
  name,
  size = 'md',
  className = '',
}) => (
  <svg
    class={`${SIZE_MAP[size]} ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d={PATHS[name]} />
  </svg>
);
