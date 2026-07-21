import { type ColumnDef } from '@tanstack/react-table';
import type { Niche } from '../../types/niche';
import {
  type StoredYoutubeChannelType,
  type YoutubeChannel,
  type YoutubeChannelLanguage,
  type YoutubeChannelStatus,
} from '../../types/youtubeChannel';
import type { SourceChannel } from '../../types/sourceChannel';
import { resolveNicheLabel } from '../../utils/niche';
import { formatChannelSources } from '../../utils/youtubeChannel';
import { Button, DataTable } from '../ui';

interface YoutubeChannelsTableProps {
  channels: YoutubeChannel[];
  sources: SourceChannel[];
  niches?: Niche[];
  selectedIds: Set<string>;
  loading?: boolean;
  openingProfileIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onOpenProfile: (channel: YoutubeChannel) => void;
}

const typeLabels: Record<StoredYoutubeChannelType, string> = {
  content: 'Nội dung',
  reup_audio: 'Reup âm thanh',
  reup_video: 'Reup video',
  content_sale: 'Bán nội dung',
  reup: 'Reup',
};

const languageLabels: Record<YoutubeChannelLanguage, string> = {
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn',
  ja: 'Tiếng Nhật',
  es: 'Tiếng Tây Ban Nha',
};

function typeLabel(type: StoredYoutubeChannelType): string {
  return typeLabels[type] ?? type;
}

function languageLabel(language: YoutubeChannelLanguage): string {
  return languageLabels[language] ?? language;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function SourceCell({ value }: { value: string }) {
  return (
    <p className="max-w-[12rem] truncate text-xs text-neutral-400" title={value}>
      {value}
    </p>
  );
}

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'default';
}

function StatusCell({ status }: { status: YoutubeChannelStatus }) {
  const isActive = status === 'active';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        isActive
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-danger/30 bg-danger/10 text-danger'
      }`}
    >
      <span className={`size-1.5 rounded-full ${isActive ? 'bg-success' : 'bg-danger'}`} />
      {isActive ? 'Đang hoạt động' : 'Bị tạm ngưng'}
    </span>
  );
}

export function YoutubeChannelsTable({
  channels,
  sources,
  niches = [],
  selectedIds,
  loading,
  openingProfileIds,
  onSelect,
  onToggleRow,
  onToggleAll,
  onOpenProfile,
}: YoutubeChannelsTableProps) {
  const columns: ColumnDef<YoutubeChannel, unknown>[] = [
    {
      id: 'channel',
      header: 'KÊNH',
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
      header: 'EMAIL LIÊN KẾT',
      cell: ({ getValue }) => (
        <p className="max-w-[14rem] truncate font-mono text-xs text-neutral-400">{getValue<string>()}</p>
      ),
    },
    {
      accessorKey: 'type',
      header: 'LOẠI',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{typeLabel(getValue<StoredYoutubeChannelType>())}</span>
      ),
    },
    {
      id: 'source',
      header: 'NGUỒN',
      cell: ({ row }) => <SourceCell value={formatChannelSources(row.original, sources)} />,
    },
    {
      id: 'nicheLang',
      header: 'CHỦ ĐỀ / NGÔN NGỮ',
      cell: ({ row }) => (
        <span className="text-neutral-400">
          {resolveNicheLabel(row.original.niche, niches) || '—'} (
          {languageLabel(row.original.language)})
        </span>
      ),
    },
    {
      accessorKey: 'lastUploadAt',
      header: 'LẦN TẢI LÊN GẦN NHẤT',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatDate(getValue<string | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'TRẠNG THÁI',
      cell: ({ row }) => <StatusCell status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'THAO TÁC',
      cell: ({ row }) => {
        const channel = row.original;
        const opening = openingProfileIds.has(channel.id);
        const canOpen = canOpenGpmProfile(channel.linkedEmail);

        return (
          <div onClick={e => e.stopPropagation()}>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              disabled={!canOpen || opening}
              title={canOpen ? undefined : 'Kênh chưa có email liên kết'}
              onClick={() => onOpenProfile(channel)}
            >
              {opening ? 'Đang mở…' : 'Mở Profile'}
            </Button>
          </div>
        );
      },
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
      emptyMessage="Không có kênh nào phù hợp với bộ lọc."
    />
  );
}
