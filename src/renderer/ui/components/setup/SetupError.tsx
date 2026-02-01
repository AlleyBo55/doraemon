import type { FunctionalComponent } from 'preact';
import { Button } from '../../primitives';

type SetupErrorProps = {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

const AlertIcon = () => (
  <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
    <path d="M8 4.5V8.5M8 11V11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

export const SetupError: FunctionalComponent<SetupErrorProps> = ({
  title,
  message,
  onRetry,
  onDismiss,
}) => (
  <div class="rounded-lg bg-red-50/80 border border-red-200/60 px-3.5 py-3">
    <div class="flex gap-2.5">
      <div class="flex-shrink-0 text-red-500 mt-0.5">
        <AlertIcon />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[13px] font-medium text-red-800">{title}</p>
        <p class="text-[12px] text-red-600/90 mt-0.5">{message}</p>
        {(onRetry || onDismiss) && (
          <div class="flex gap-2 mt-2.5">
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
