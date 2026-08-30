import { type ColumnDef } from '@tanstack/react-table';
import type { Niche } from '../../types/niche';
import {
  type YoutubeChannel,
  type YoutubeChannelLanguage,
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
  rowNumberStart?: number;
  openingProfileIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onOpenProfile: (channel: YoutubeChannel) => void;
  onEdit?: (channel: YoutubeChannel) => void;
  onDelete?: (channel: YoutubeChannel) => void;
  deletingChannelId?: string | null;
}

const languageLabels: Record<YoutubeChannelLanguage, string> = {
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn',
  ja: 'Tiếng Nhật',
  es: 'Tiếng Tây Ban Nha',
};

function languageLabel(language: YoutubeChannelLanguage): string {
  return languageLabels[language] ?? language;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function formatDateOnly(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
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

function OpenProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden='true'
    >
      <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
      <circle cx='12' cy='7' r='4' />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden='true'
    >
      <path d='M12 20h9' />
      <path d='M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z' />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      aria-hidden='true'
    >
      <path d='M3 6h18' />
      <path d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' />
      <path d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
    </svg>
  );
}

export function YoutubeChannelsTable({
  channels,
  sources,
  niches = [],
  selectedIds,
  loading,
  rowNumberStart,
  openingProfileIds,
  onSelect,
  onToggleRow,
  onToggleAll,
  onOpenProfile,
  onEdit,
  onDelete,
  deletingChannelId = null,
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
      cell: ({ row }) => {
        const lastUploadAt = row.original.lastUploadAt;
        if (lastUploadAt) {
          const nextUploadAt = row.original.nextUploadAt;
          const dueSoon =
            Boolean(nextUploadAt) &&
            new Date(nextUploadAt!).getTime() <= Date.now() + 24 * 60 * 60 * 1000;
          return (
            <span className={dueSoon ? 'text-danger' : 'text-neutral-300'}>
              {formatDate(lastUploadAt)}
            </span>
          );
        }
        return (
          <span className="text-neutral-300">
            {formatDateOnly(row.original.createdAt)}{' '}
            <span className="text-neutral-500">(SEEDING)</span>
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'THAO TÁC',
      cell: ({ row }) => {
        const channel = row.original;
        const opening = openingProfileIds.has(channel.id);
        const canOpen = canOpenGpmProfile(channel.linkedEmail);

        const deleting = deletingChannelId === channel.id;

        return (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button
              variant="outlined"
              size="icon"
              className="size-8 rounded-lg"
              disabled={!canOpen || opening}
              title={opening ? 'Đang mở…' : canOpen ? 'Mở Profile' : 'Kênh chưa có email liên kết'}
              aria-label={opening ? 'Đang mở profile' : 'Mở Profile'}
              onClick={() => onOpenProfile(channel)}
            >
              <OpenProfileIcon className="size-4" />
            </Button>
            {onEdit ? (
              <Button
                variant="outlined"
                size="icon"
                className="size-8 rounded-lg"
                title="Chỉnh sửa"
                aria-label="Chỉnh sửa kênh"
                disabled={deleting}
                onClick={() => onEdit(channel)}
              >
                <EditIcon className="size-4" />
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                variant="danger"
                size="icon"
                className="size-8 rounded-lg"
                title={deleting ? 'Đang xóa…' : 'Xóa kênh'}
                aria-label={deleting ? 'Đang xóa kênh' : 'Xóa kênh'}
                disabled={deleting}
                onClick={() => onDelete(channel)}
              >
                <TrashIcon className="size-4" />
              </Button>
            ) : null}
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
      rowNumberStart={rowNumberStart}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={channel => onToggleRow(channel.id)}
      emptyMessage="Không có kênh nào phù hợp với bộ lọc."
    />
  );
}
