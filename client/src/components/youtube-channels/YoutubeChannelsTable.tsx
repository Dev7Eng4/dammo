import { YOUTUBE_CHANNEL_TYPE_LABELS, type YoutubeChannel, type YoutubeChannelType } from '../../types/youtubeChannel';
import { ChannelStatusPill } from './ChannelStatusPill';
import { HealthIndicator } from './HealthIndicator';
import { MonetizationPill } from './MonetizationPill';

interface YoutubeChannelsTableProps {
  channels: YoutubeChannel[];
  selectedIds: Set<string>;
  loading?: boolean;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

function typeLabel(type: YoutubeChannelType): string {
  return YOUTUBE_CHANNEL_TYPE_LABELS[type];
}

function ChannelAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-xs font-semibold text-neutral-300">
      {initial}
    </div>
  );
}

export function YoutubeChannelsTable({
  channels,
  selectedIds,
  loading,
  onSelect,
  onToggleRow,
  onToggleAll,
}: YoutubeChannelsTableProps) {
  const allSelected = channels.length > 0 && selectedIds.size === channels.length;

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 w-8" />
              <th className="pb-3 pr-4 font-medium">CHANNEL</th>
              <th className="pb-3 pr-4 font-medium">LINKED EMAIL</th>
              <th className="pb-3 pr-4 font-medium">TYPE</th>
              <th className="pb-3 pr-4 font-medium">NICHE / LANG</th>
              <th className="pb-3 pr-4 font-medium">MONETIZATION</th>
              <th className="pb-3 pr-4 font-medium">HEALTH</th>
              <th className="pb-3 font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={8} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No channels match your filter.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="size-3.5 rounded border-border bg-surface accent-primary-500"
              />
            </th>
            <th className="pb-3 pr-4 font-medium">CHANNEL</th>
            <th className="pb-3 pr-4 font-medium">LINKED EMAIL</th>
            <th className="pb-3 pr-4 font-medium">TYPE</th>
            <th className="pb-3 pr-4 font-medium">NICHE / LANG</th>
            <th className="pb-3 pr-4 font-medium">MONETIZATION</th>
            <th className="pb-3 pr-4 font-medium">HEALTH</th>
            <th className="pb-3 font-medium">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr
              key={channel.id}
              onClick={() => onSelect(channel.id)}
              className="border-b border-border/50 cursor-pointer transition-colors hover:bg-surface-elevated/50"
            >
              <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(channel.id)}
                  onChange={() => onToggleRow(channel.id)}
                  className="size-3.5 rounded border-border bg-surface accent-primary-500"
                />
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelAvatar name={channel.name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-100">{channel.name}</p>
                    <p className="truncate text-xs text-neutral-500">{channel.handle}</p>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4">
                <p className="max-w-[14rem] truncate font-mono text-xs text-neutral-400">
                  {channel.linkedEmail}
                </p>
              </td>
              <td className="py-3 pr-4 text-neutral-300">{typeLabel(channel.type)}</td>
              <td className="py-3 pr-4 text-neutral-400">
                {channel.niche} ({channel.language})
              </td>
              <td className="py-3 pr-4">
                <MonetizationPill status={channel.monetizationStatus} />
              </td>
              <td className="py-3 pr-4">
                <HealthIndicator score={channel.healthScore} />
              </td>
              <td className="py-3">
                <ChannelStatusPill status={channel.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
