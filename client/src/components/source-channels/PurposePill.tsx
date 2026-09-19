import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { cn } from '../../lib/cn';
import type { SourcePurpose } from '../../types/sourceChannel';

const PURPOSE_I18N_KEY: Record<SourcePurpose, string> = {
  trend_tracking: 'purpose.trend',
  idea_reference: 'purpose.idea',
  licensed_source: 'purpose.licensed',
  competitor_tracking: 'purpose.competitor',
  reup: 'purpose.reup',
  background_footage: 'purpose.background',
};

const config: Record<SourcePurpose, { dot: string; text: string; bg: string }> = {
  trend_tracking: {
    dot: 'bg-secondary-400',
    text: 'text-secondary-400',
    bg: 'bg-secondary-500/10 border-secondary-500/30',
  },
  idea_reference: {
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  licensed_source: {
    dot: 'bg-primary-400',
    text: 'text-primary-400',
    bg: 'bg-primary-500/10 border-primary-500/30',
  },
  competitor_tracking: {
    dot: 'bg-neutral-400',
    text: 'text-neutral-400',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
  reup: {
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  background_footage: {
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
  const { t } = useTranslation('source');
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
      {t(PURPOSE_I18N_KEY[purpose])}
    </span>
  );
}

export function purposeLabel(purpose: SourcePurpose): string {
  return i18n.t(PURPOSE_I18N_KEY[purpose], { ns: 'source' });
}

export const SOURCE_PURPOSE_SELECT_VALUES: SourcePurpose[] = ['reup', 'background_footage'];

export function getSourcePurposeSelectOptions(t: (key: string) => string) {
  return SOURCE_PURPOSE_SELECT_VALUES.map((value) => ({
    value,
    label: t(PURPOSE_I18N_KEY[value]),
  }));
}
