import type { FunctionalComponent } from 'preact';
import { ProgressBar } from '../../primitives';

type SetupProgressProps = {
  current: number;
  total: number;
  label?: string;
};

export const SetupProgress: FunctionalComponent<SetupProgressProps> = ({
  current,
  total,
  label,
}) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs">
        <span class="text-slate-600">{label || 'Progress'}</span>
        <span class="text-slate-500 tabular-nums">
          {current}/{total}
        </span>
      </div>
      <ProgressBar value={percentage} />
    </div>
  );
};
