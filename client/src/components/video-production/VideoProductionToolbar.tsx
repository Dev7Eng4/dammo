import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Select } from '../ui';

export interface ProductionChannelOption {
  id: string;
  name: string;
  videoCount: number;
}

interface VideoProductionToolbarProps {
  channels: ProductionChannelOption[];
  selectedChannelId: string | null;
  onChannelChange: (channelId: string | null) => void;
  total: number;
  channelLoading?: boolean;
  trailing?: ReactNode;
}

export function VideoProductionToolbar({
  channels,
  selectedChannelId,
  onChannelChange,
  total,
  channelLoading = false,
  trailing,
}: VideoProductionToolbarProps) {
  const { t } = useTranslation('factory');

  const channelOptions = channels.map((channel) => ({
    value: channel.id,
    label: `${channel.name} (${channel.videoCount})`,
  }));

  const hasChannel = Boolean(selectedChannelId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('production.toolbar.step1')}
          </span>
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
        </label>

        {trailing ? <div className="flex shrink-0 items-end">{trailing}</div> : null}
      </div>

      <div className="flex justify-end">
        <span className="text-xs text-muted-foreground">
          {hasChannel
            ? t('production.toolbar.count', { total })
            : t('production.toolbar.noChannel')}
        </span>
      </div>
    </div>
  );
}
