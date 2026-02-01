import type { FunctionalComponent } from 'preact';

type ProgressBarProps = {
  value?: number;
  indeterminate?: boolean;
  className?: string;
};

export const ProgressBar: FunctionalComponent<ProgressBarProps> = ({
  value = 0,
  indeterminate = false,
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      class={`
        relative h-1 w-full overflow-hidden rounded-full
        bg-slate-200
        ${className}
      `}
    >
      {indeterminate ? (
        <div
          class="absolute h-full w-1/4 rounded-full bg-dora-blue animate-indeterminate"
        />
      ) : (
        <div
          class="h-full rounded-full bg-dora-blue transition-all duration-300"
          style={{ width: `${clampedValue}%` }}
        />
      )}
    </div>
  );
};
