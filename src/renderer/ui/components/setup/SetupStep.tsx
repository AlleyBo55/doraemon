import type { FunctionalComponent, JSX } from 'preact';
import { Spinner } from '../../primitives';

export type StepStatus = 'pending' | 'running' | 'success' | 'error';

type SetupStepProps = {
  title: string;
  description?: string;
  status: StepStatus;
  children?: JSX.Element;
};

const CheckIcon = () => (
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none">
    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none">
    <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const StatusIndicator: Record<StepStatus, JSX.Element> = {
  pending: <div class="w-[18px] h-[18px] rounded-full border-[1.5px] border-slate-300" />,
  running: <Spinner size="sm" className="text-dora-blue" />,
  success: (
    <div class="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
      <CheckIcon />
    </div>
  ),
  error: (
    <div class="w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center">
      <XIcon />
    </div>
  ),
};

export const SetupStep: FunctionalComponent<SetupStepProps> = ({
  title,
  description,
  status,
  children,
}) => (
  <div class="flex items-center gap-3 py-2.5">
    <div class="flex-shrink-0 text-white">{StatusIndicator[status]}</div>
    <div class="flex-1 min-w-0">
      <span class="text-[13px] font-medium text-slate-800">{title}</span>
      {description && (
        <span class="text-[13px] text-slate-400 ml-2">{description}</span>
      )}
    </div>
    {children}
  </div>
);
