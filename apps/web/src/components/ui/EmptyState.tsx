import { VinylRecord, WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  /** Less padding, for use inside a section rather than as the whole page. */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`animate-fade-up flex flex-col items-center px-6 text-center ${compact ? 'py-10' : 'py-16 sm:py-24'}`}>
      <div className="mb-5 text-faint [&>svg]:h-10 [&>svg]:w-10">{icon || <VinylRecord weight="light" />}</div>
      <h3 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4 text-sm">
      <WarningCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="text-fg">{error.message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-1.5 font-medium text-danger underline underline-offset-4">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
