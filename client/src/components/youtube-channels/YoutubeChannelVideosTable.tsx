import { type ColumnDef } from '@tanstack/react-table';
import { cn } from '../../lib/cn';
import type { YoutubeChannelVideo, YoutubeChannelVideoStatus } from '../../types/youtubeChannel';
import { DataTable } from '../ui';

interface YoutubeChannelVideosTableProps {
  videos: YoutubeChannelVideo[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onCommentClick?: (video: YoutubeChannelVideo) => void;
}

const statusConfig: Record<
  YoutubeChannelVideoStatus,
  { label: string; text: string; bg: string }
> = {
  Published: {
    label: 'Published',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  Prepared: {
    label: 'Prepared',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  Created: {
    label: 'Created',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  Uploaded: {
    label: 'Uploaded',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
  Error: {
    label: 'Error',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
};

function VideoStatusBadge({ status }: { status: YoutubeChannelVideoStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
      )}
    >
      {config.label}
    </span>
  );
}

function formatCount(count?: number | null): string {
  if (count == null) return '—';
  return count.toLocaleString();
}

export function YoutubeChannelVideosTable({
  videos,
  loading,
  error,
  emptyMessage = 'No videos found.',
  onCommentClick,
}: YoutubeChannelVideosTableProps) {
  const columns: ColumnDef<YoutubeChannelVideo, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'TITLE',
      cell: ({ getValue }) => (
        <span className="font-medium text-neutral-100">{getValue<string>()}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => <VideoStatusBadge status={row.original.status ?? 'Published'} />,
    },
    {
      accessorKey: 'viewCount',
      header: 'VIEWS',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatCount(getValue<number | null | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'likeCount',
      header: 'LIKES',
      cell: ({ getValue }) => (
        <span className="text-neutral-300">{formatCount(getValue<number | null | undefined>())}</span>
      ),
    },
    {
      accessorKey: 'commentCount',
      header: 'COMMENTS',
      cell: ({ row }) => {
        const count = row.original.commentCount;
        if (count != null && count > 0 && onCommentClick) {
          return (
            <button
              type="button"
              onClick={() => onCommentClick(row.original)}
              className="cursor-pointer text-secondary-400 hover:text-secondary-300 hover:underline"
            >
              {formatCount(count)}
            </button>
          );
        }
        return <span className="text-neutral-300">{formatCount(count)}</span>;
      },
    },
  ];

  return (
    <DataTable
      data={videos}
      columns={columns}
      getRowId={video => video.id}
      loading={loading}
      error={error}
      emptyMessage={emptyMessage}
    />
  );
}
