import { cn } from '../../lib/cn';
import type { SourcePurpose } from '../../types/sourceChannel';

const config: Record<
  SourcePurpose,
  { label: string; dot: string; text: string; bg: string }
> = {
  trend_tracking: {
    label: 'Trend Tracking',
    dot: 'bg-secondary-400',
    text: 'text-secondary-400',
    bg: 'bg-secondary-500/10 border-secondary-500/30',
  },
  idea_reference: {
    label: 'Idea Reference',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  licensed_source: {
    label: 'Licensed Source',
    dot: 'bg-primary-400',
    text: 'text-primary-400',
    bg: 'bg-primary-500/10 border-primary-500/30',
  },
  competitor_tracking: {
    label: 'Competitor Tracking',
    dot: 'bg-neutral-400',
    text: 'text-neutral-400',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
  reup: {
    label: 'Reup',
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  background_footage: {
    label: 'Background Footage',
    dot: 'bg-info',
    text: 'text-info',
    bg: 'bg-info/10 border-info/30',
  },
};

interface PurposePillProps {
  purpose: SourcePurpose;
  className?: string;
}

export function PurposePill({ purpose, className }: PurposePillProps) {
  const c = config[purpose];
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

export function purposeLabel(purpose: SourcePurpose): string {
  return config[purpose].label;
}
