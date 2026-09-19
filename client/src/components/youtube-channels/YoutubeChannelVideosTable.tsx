import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { YoutubeChannelVideo, YoutubeChannelVideoStatus } from '../../types/youtubeChannel'
import { DataTable } from '../ui'

interface YoutubeChannelVideosTableProps {
  videos: YoutubeChannelVideo[]
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  rowNumberStart?: number
  selectedIds?: Set<string>
  onToggleRow?: (id: string) => void
  onToggleAll?: () => void
  enableRowSelection?: boolean
  onCommentClick?: (video: YoutubeChannelVideo) => void
  onTitleClick?: (video: YoutubeChannelVideo) => void
}

const statusStyle: Record<YoutubeChannelVideoStatus, { labelKey: string; text: string; bg: string }> = {
  Published: {
    labelKey: 'status.published',
    text: 'text-success',
    bg: 'bg-success/10 border-success/30',
  },
  Prepared: {
    labelKey: 'status.prepared',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  Created: {
    labelKey: 'status.created',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  Uploaded: {
    labelKey: 'status.uploaded',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
  Pending: {
    labelKey: 'status.pending',
    text: 'text-neutral-300',
    bg: 'bg-neutral-700/40 border-neutral-600/50',
  },
  Error: {
    labelKey: 'status.error',
    text: 'text-danger',
    bg: 'bg-danger/10 border-danger/30',
  },
}

function VideoStatusBadge({ status }: { status: YoutubeChannelVideoStatus }) {
  const { t } = useTranslation('youtube')
  const config = statusStyle[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
      )}
    >
      {t(config.labelKey)}
    </span>
  )
}

function formatCount(count: number | null | undefined, locale: string): string {
  if (count == null) return '—'
  return count.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
}

function isContentViewable(video: YoutubeChannelVideo): boolean {
  return (
    video.status === 'Prepared' ||
    video.status === 'Created' ||
    video.localFolder === 'uploads'
  )
}

export function YoutubeChannelVideosTable({
  videos,
  loading,
  error,
  emptyMessage,
  rowNumberStart,
  selectedIds,
  onToggleRow,
  onToggleAll,
  enableRowSelection = false,
  onCommentClick,
  onTitleClick,
}: YoutubeChannelVideosTableProps) {
  const { t, i18n } = useTranslation('youtube')

  const columns: ColumnDef<YoutubeChannelVideo, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: t('videos.col.title'),
        cell: ({ row, getValue }) => {
          const title = getValue<string>()
          if (isContentViewable(row.original) && onTitleClick) {
            return (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  onTitleClick(row.original)
                }}
                className="cursor-pointer text-left font-medium text-secondary-400 hover:text-secondary-300 hover:underline"
              >
                {title}
              </button>
            )
          }
          return <span className="font-medium text-neutral-100">{title}</span>
        },
      },
      {
        accessorKey: 'status',
        header: t('videos.col.status'),
        cell: ({ row }) => <VideoStatusBadge status={row.original.status ?? 'Published'} />,
      },
      {
        accessorKey: 'viewCount',
        header: t('videos.col.views'),
        cell: ({ getValue }) => (
          <span className="text-neutral-300">
            {formatCount(getValue<number | null | undefined>(), i18n.language)}
          </span>
        ),
      },
      {
        accessorKey: 'likeCount',
        header: t('videos.col.likes'),
        cell: ({ getValue }) => (
          <span className="text-neutral-300">
            {formatCount(getValue<number | null | undefined>(), i18n.language)}
          </span>
        ),
      },
      {
        accessorKey: 'commentCount',
        header: t('videos.col.comments'),
        cell: ({ row }) => {
          const count = row.original.commentCount
          if (count != null && count > 0 && onCommentClick) {
            return (
              <button
                type="button"
                onClick={() => onCommentClick(row.original)}
                className="cursor-pointer text-secondary-400 hover:text-secondary-300 hover:underline"
              >
                {formatCount(count, i18n.language)}
              </button>
            )
          }
          return <span className="text-neutral-300">{formatCount(count, i18n.language)}</span>
        },
      },
    ],
    [t, i18n.language, onTitleClick, onCommentClick],
  )

  return (
    <DataTable
      data={videos}
      columns={columns}
      getRowId={video => video.id}
      loading={loading}
      error={error}
      emptyMessage={emptyMessage ?? t('videos.empty')}
      rowNumberStart={rowNumberStart}
      enableRowSelection={enableRowSelection}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      onRowClick={onToggleRow ? video => onToggleRow(video.id) : undefined}
    />
  )
}
