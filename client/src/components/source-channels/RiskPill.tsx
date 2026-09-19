import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { cn } from '../../lib/cn';
import type { SourceRiskLevel } from '../../types/sourceChannel';

const RISK_I18N_KEY: Record<SourceRiskLevel, string> = {
  low: 'risk.low',
  medium: 'risk.medium',
  high: 'risk.high',
};

const config: Record<SourceRiskLevel, { dot: string; text: string; bg: string }> = {
  low: {
    dot: 'bg-success',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  medium: {
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  high: {
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
  const { t } = useTranslation('source');
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
      {t(RISK_I18N_KEY[risk])}
    </span>
  );
}

export function riskLabel(risk: SourceRiskLevel): string {
  return i18n.t(RISK_I18N_KEY[risk], { ns: 'source' });
}
