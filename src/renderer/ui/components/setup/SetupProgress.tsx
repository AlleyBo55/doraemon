import type { FunctionalComponent } from 'preact';

type SetupProgressProps = {
  current: number;
  total: number;
  label?: string;
};

export const SetupProgress: FunctionalComponent<SetupProgressProps> = ({
  current,
  total,
}) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div class="mb-6">
      <div class="h-1 bg-slate-200/80 rounded-full overflow-hidden">
        <div
          class="h-full bg-dora-blue rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
