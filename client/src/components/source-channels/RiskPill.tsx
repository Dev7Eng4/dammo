import { cn } from '../../lib/cn';
import type { SourceRiskLevel } from '../../types/sourceChannel';

const config: Record<
  SourceRiskLevel,
  { label: string; dot: string; text: string; bg: string }
> = {
  low: {
    label: 'Low',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  high: {
    label: 'High',
    dot: 'bg-danger',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

interface RiskPillProps {
  risk: SourceRiskLevel;
  className?: string;
}

export function RiskPill({ risk, className }: RiskPillProps) {
  const c = config[risk];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
}

export function riskLabel(risk: SourceRiskLevel): string {
  return config[risk].label;
}
