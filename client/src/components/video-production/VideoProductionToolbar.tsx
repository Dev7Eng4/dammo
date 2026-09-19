import { Search } from 'lucide-react';
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
  search: string;
  total: number;
  channelLoading?: boolean;
  onSearchChange: (value: string) => void;
  trailing?: ReactNode;
}

export function VideoProductionToolbar({
  channels,
  selectedChannelId,
  onChannelChange,
  search,
  total,
  channelLoading = false,
  onSearchChange,
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
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-end">
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

        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('production.toolbar.step2')}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={
                hasChannel
                  ? t('production.toolbar.videoSearch')
                  : t('production.toolbar.selectChannelFirst')
              }
              disabled={!hasChannel}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
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
