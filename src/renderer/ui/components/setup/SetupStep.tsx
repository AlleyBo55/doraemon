import type { FunctionalComponent, JSX } from 'preact';
import { Icon, Spinner } from '../../primitives';

export type StepStatus = 'pending' | 'running' | 'success' | 'error';

type SetupStepProps = {
  title: string;
  description?: string;
  status: StepStatus;
  children?: JSX.Element;
};

const STATUS_ICON: Record<StepStatus, JSX.Element> = {
  pending: <div class="w-5 h-5 rounded-full border-2 border-slate-300" />,
  running: <Spinner size="sm" className="text-dora-blue" />,
  success: (
    <div class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
      <Icon name="check" size="sm" className="text-white" />
    </div>
  ),
  error: (
    <div class="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
      <Icon name="x" size="sm" className="text-white" />
    </div>
  ),
};

export const SetupStep: FunctionalComponent<SetupStepProps> = ({
  title,
  description,
  status,
  children,
}) => (
  <div class="flex gap-3 py-3">
    <div class="flex-shrink-0 pt-0.5">{STATUS_ICON[status]}</div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-slate-800">{title}</p>
      {description && (
        <p class="text-xs text-slate-500 mt-0.5">{description}</p>
      )}
      {children && <div class="mt-2">{children}</div>}
    </div>
  </div>
);
