import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Select } from '../ui';

export type ProductionStatusFilter = 'all' | 'Created' | 'Prepared';

export interface ProductionChannelOption {
  id: string;
  name: string;
  videoCount: number;
}

interface VideoProductionToolbarProps {
  channels: ProductionChannelOption[];
  selectedChannelId: string | null;
  onChannelChange: (channelId: string | null) => void;
  statusFilter: ProductionStatusFilter;
  onStatusFilterChange: (status: ProductionStatusFilter) => void;
  channelLoading?: boolean;
  trailing?: ReactNode;
}

export function VideoProductionToolbar({
  channels,
  selectedChannelId,
  onChannelChange,
  statusFilter,
  onStatusFilterChange,
  channelLoading = false,
  trailing,
}: VideoProductionToolbarProps) {
  const { t } = useTranslation('factory');

  const channelOptions = channels.map((channel) => ({
    value: channel.id,
    label: `${channel.name} (${channel.videoCount})`,
  }));

  const statusOptions = [
    { value: 'all', label: t('production.toolbar.statusAll') },
    { value: 'Created', label: t('production.toolbar.statusCreated') },
    { value: 'Prepared', label: t('production.toolbar.statusPrepared') },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-36 shrink-0">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => onStatusFilterChange((value || 'all') as ProductionStatusFilter)}
          />
        </div>
        <div className="w-1/3 min-w-0">
          <Select
            options={channelOptions}
            value={selectedChannelId ?? ''}
            onChange={(value) => onChannelChange(value || null)}
            placeholder={
              channelLoading
                ? t('production.toolbar.channelLoading')
                : t('production.toolbar.channelPlaceholder')
            }
            searchable
            searchPlaceholder={t('production.toolbar.channelSearch')}
            clearable
            disabled={channelLoading || channels.length === 0}
          />
        </div>

        {trailing ? <div className="flex min-w-0 flex-1 items-center justify-end">{trailing}</div> : null}
      </div>
    </div>
  );
}
