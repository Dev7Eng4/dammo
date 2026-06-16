import { cn } from '../../lib/cn';
import type { AlertSeverity } from '../../types/dashboard';

const severityStyles: Record<AlertSeverity, string> = {
  warning: 'border-warning/50 bg-warning/5',
  neutral: 'border-border bg-surface',
  danger: 'border-danger/50 bg-danger/5',
};

const severityTitleStyles: Record<AlertSeverity, string> = {
  warning: 'text-warning',
  neutral: 'text-neutral-200',
  danger: 'text-danger',
};

export interface AlertCardProps {
  title: string;
  description: string;
  severity: AlertSeverity;
  className?: string;
}

export function AlertCard({ title, description, severity, className }: AlertCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3',
        severityStyles[severity],
        className,
      )}
    >
      <p className={cn('text-sm font-medium', severityTitleStyles[severity])}>{title}</p>
      <p className="mt-1 text-xs text-neutral-400">{description}</p>
    </div>
  );
}
