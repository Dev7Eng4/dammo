import { type ColumnDef } from '@tanstack/react-table';
import type { Niche } from '../../types/niche';
import {
  formatChannelLanguageLabel,
  YOUTUBE_CHANNEL_TYPE_LABELS,
  type StoredYoutubeChannelType,
  type YoutubeChannel,
} from '../../types/youtubeChannel';
import type { SourceChannel } from '../../types/sourceChannel';
import { resolveNicheLabel } from '../../utils/niche';
import { formatChannelSources } from '../../utils/youtubeChannel';
import { DataTable } from '../ui';
import { ChannelStatusPill } from './ChannelStatusPill';

interface YoutubeChannelsTableProps {
  channels: YoutubeChannel[];
  sources: SourceChannel[];
  niches?: Niche[];
  selectedIds: Set<string>;
  loading?: boolean;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

function typeLabel(type: StoredYoutubeChannelType): string {
  return YOUTUBE_CHANNEL_TYPE_LABELS[type] ?? type;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US');
}

function SourceCell({ value }: { value: string }) {
  return (
    <p className="max-w-[12rem] truncate text-xs text-neutral-400" title={value}>
      {value}
    </p>
  );
}

export function YoutubeChannelsTable({
  channels,
  sources,
  niches = [],
  selectedIds,
  loading,
  onSelect,
  onToggleRow,
  onToggleAll,
}: YoutubeChannelsTableProps) {
  const columns: ColumnDef<YoutubeChannel, unknown>[] = [
    {
      id: 'channel',
      header: 'CHANNEL',
      cell: ({ row }) => {
        const channel = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="min-w-0 text-cyan-400"
              onClick={e => {
                e.stopPropagation();
                onSelect(channel.id);
              }}
            >
              <p className="truncate font-medium">{channel.name}</p>
              <p className="truncate text-xs">{channel.handle}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'linkedEmail',
      header: 'LINKED EMAIL',
      cell: ({ getValue }) => (
        <p className="max-w-[14rem] truncate font-mono text-xs text-neutral-400">{getValue<string>()}</p>
      ),
    },
    {
      accessorKey: 'type',
      header: 'TYPE',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{typeLabel(getValue<StoredYoutubeChannelType>())}</span>
      ),
    },
    {
      id: 'source',
      header: 'SOURCE',
      cell: ({ row }) => <SourceCell value={formatChannelSources(row.original, sources)} />,
    },
    {
      id: 'nicheLang',
      header: 'NICHE / LANG',
      cell: ({ row }) => (
        <span className="text-neutral-400">
          {resolveNicheLabel(row.original.niche, niches) || '—'} (
          {formatChannelLanguageLabel(row.original.language)})
        </span>
      ),
    },
    {
      accessorKey: 'lastUploadAt',
      header: 'LAST UPLOAD',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => <ChannelStatusPill status={row.original.status} />,
    },
  ];

  return (
    <DataTable
      data={channels}
      columns={columns}
      getRowId={channel => channel.id}
      loading={loading}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={channel => onToggleRow(channel.id)}
      emptyMessage="No channels match your filter."
    />
  );
}
