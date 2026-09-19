import { type ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import type { SourceChannelVideo } from '../../types/sourceChannel';
import { DataTable, Link } from '../ui';

interface SourceChannelVideosTableProps {
  videos: SourceChannelVideo[];
  loading?: boolean;
  error?: string | null;
  rowNumberStart?: number;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatViews(count?: number): string {
  if (count === undefined) return '—';
  return count.toLocaleString();
}

function truncateLink(url: string, max = 32) {
  const display = url.replace('https://', '');
  if (display.length <= max) return display;
  return display.slice(0, max) + '...';
}

export function SourceChannelVideosTable({
  videos,
  loading,
  error,
  rowNumberStart,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: SourceChannelVideosTableProps) {
  const { t } = useTranslation('source');

  const columns: ColumnDef<SourceChannelVideo, unknown>[] = [
    {
      accessorKey: 'title',
      header: t('videos.col.title'),
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'url',
      header: t('videos.col.link'),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-neutral-500">
          <Link href={row.original.url}>{truncateLink(row.original.url)}</Link>
        </span>
      ),
    },
    {
      accessorKey: 'viewCount',
      header: t('videos.col.views'),
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatViews(getValue<number | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'duration',
      header: t('videos.col.duration'),
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatDuration(getValue<number | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('videos.col.status'),
      cell: ({ row }) =>
        row.original.status === 'Downloaded' ? (
          <span className="text-xs font-medium text-primary-400">{t('videos.downloaded')}</span>
        ) : (
          <span className="text-xs text-neutral-500">—</span>
        ),
    },
  ];

  return (
    <DataTable
      data={videos}
      columns={columns}
      getRowId={video => video.id}
      loading={loading}
      error={error}
      rowNumberStart={rowNumberStart}
      enableRowSelection
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={video => onToggleRow(video.id)}
      emptyMessage={t('videos.empty')}
    />
  );
}
