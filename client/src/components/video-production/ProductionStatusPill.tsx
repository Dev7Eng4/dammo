import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';
import type { ProductionVideoStatus } from '../../types/videoProductionScenes';

const statusTone: Record<ProductionVideoStatus, StatusTone> = {
  Prepared: 'info',
  Created: 'success',
};

interface ProductionStatusPillProps {
  status: ProductionVideoStatus;
  className?: string;
}

export function ProductionStatusPill({ status, className }: ProductionStatusPillProps) {
  const { t } = useTranslation('factory');
  const label =
    status === 'Prepared'
      ? t('production.status.prepared')
      : t('production.status.created');
  return <StatusBadge label={label} tone={statusTone[status]} withDot className={className} />;
}
