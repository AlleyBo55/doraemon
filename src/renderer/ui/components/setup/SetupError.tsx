import type { FunctionalComponent } from 'preact';
import { Button, Icon } from '../../primitives';

type SetupErrorProps = {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export const SetupError: FunctionalComponent<SetupErrorProps> = ({
  title,
  message,
  onRetry,
  onDismiss,
}) => (
  <div class="rounded-xl bg-red-50 border border-red-100 p-4">
    <div class="flex gap-3">
      <div class="flex-shrink-0">
        <Icon name="alert" className="text-red-500" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-medium text-red-800">{title}</h3>
        <p class="text-xs text-red-600 mt-1">{message}</p>
        {(onRetry || onDismiss) && (
          <div class="flex gap-2 mt-3">
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
