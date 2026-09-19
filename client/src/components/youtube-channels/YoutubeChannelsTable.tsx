import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import type { Niche } from '../../types/niche'
import {
  type YoutubeChannel,
  type YoutubeChannelLanguage,
} from '../../types/youtubeChannel'
import type { SourceChannel } from '../../types/sourceChannel'
import { resolveNicheLabel } from '../../utils/niche'
import { formatChannelSources } from '../../utils/youtubeChannel'
import { Button, DataTable } from '../ui'
import { ChannelStatusPill } from './ChannelStatusPill'

interface YoutubeChannelsTableProps {
  channels: YoutubeChannel[]
  sources: SourceChannel[]
  niches?: Niche[]
  selectedIds: Set<string>
  loading?: boolean
  rowNumberStart?: number
  openingProfileIds: Set<string>
  onSelect: (id: string) => void
  onToggleRow: (id: string) => void
  onToggleAll: () => void
  onOpenProfile: (channel: YoutubeChannel) => void
  onEdit?: (channel: YoutubeChannel) => void
  onPause?: (channel: YoutubeChannel) => void
  onResume?: (channel: YoutubeChannel) => void
  onDelete?: (channel: YoutubeChannel) => void
  pausingChannelId?: string | null
  resumingChannelId?: string | null
  deletingChannelId?: string | null
}

function languageLabelKey(language: YoutubeChannelLanguage): string {
  return `language.${language}`
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
}

function SourceCell({ value }: { value: string }) {
  return (
    <p className="max-w-[12rem] truncate text-xs text-neutral-400" title={value}>
      {value}
    </p>
  )
}

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase()
  return normalized.length > 0 && normalized !== 'default'
}

function OpenProfileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  )
}

function ResumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
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
  onPause,
  onResume,
  onDelete,
  pausingChannelId = null,
  resumingChannelId = null,
  deletingChannelId = null,
}: YoutubeChannelsTableProps) {
  const { t, i18n } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')

  const columns: ColumnDef<YoutubeChannel, unknown>[] = useMemo(
    () => [
      {
        id: 'channel',
        header: t('table.col.channel'),
        cell: ({ row }) => {
          const channel = row.original
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="min-w-0 text-cyan-400"
                onClick={e => {
                  e.stopPropagation()
                  onSelect(channel.id)
                }}
              >
                <p className="truncate font-medium">{channel.name}</p>
                <p className="truncate text-xs">{channel.handle}</p>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'linkedEmail',
        header: t('table.col.linkedEmail'),
        cell: ({ getValue }) => (
          <p className="max-w-[14rem] truncate font-mono text-xs text-neutral-400">
            {getValue<string>()}
          </p>
        ),
      },
      {
        id: 'source',
        header: t('table.col.source'),
        cell: ({ row }) => <SourceCell value={formatChannelSources(row.original, sources)} />,
      },
      {
        id: 'nicheLang',
        header: t('table.col.nicheLanguage'),
        cell: ({ row }) => (
          <span className="text-neutral-400">
            {resolveNicheLabel(row.original.niche, niches) || '—'} (
            {t(languageLabelKey(row.original.language))})
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('table.col.status'),
        cell: ({ row }) => <ChannelStatusPill status={row.original.status} />,
      },
      {
        accessorKey: 'lastUploadAt',
        header: t('table.col.lastUpload'),
        cell: ({ row }) => {
          const lastUploadAt = row.original.lastUploadAt
          if (!lastUploadAt) {
            return <span className="text-neutral-500">—</span>
          }
          const nextUploadAt = row.original.nextUploadAt
          const dueSoon =
            Boolean(nextUploadAt) &&
            new Date(nextUploadAt!).getTime() <= Date.now() + 24 * 60 * 60 * 1000
          return (
            <span className={dueSoon ? 'text-danger' : 'text-neutral-300'}>
              {formatDate(lastUploadAt, i18n.language)}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: t('table.col.actions'),
        cell: ({ row }) => {
          const channel = row.original
          const opening = openingProfileIds.has(channel.id)
          const canOpen = canOpenGpmProfile(channel.linkedEmail)
          const pausing = pausingChannelId === channel.id
          const resuming = resumingChannelId === channel.id
          const deleting = deletingChannelId === channel.id
          const isPaused = channel.status === 'paused'
          const isDeleted = channel.status === 'deleted'
          const busy = pausing || resuming || deleting

          return (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <Button
                variant="outlined"
                size="icon"
                className="size-8 rounded-lg"
                disabled={!canOpen || opening}
                title={
                  opening
                    ? t('actions.openingProfile')
                    : canOpen
                      ? t('actions.openProfile')
                      : t('actions.noLinkedEmail')
                }
                aria-label={opening ? t('actions.openingProfileAria') : t('actions.openProfile')}
                onClick={() => onOpenProfile(channel)}
              >
                <OpenProfileIcon className="size-4" />
              </Button>
              {onEdit ? (
                <Button
                  variant="outlined"
                  size="icon"
                  className="size-8 rounded-lg"
                  title={t('actions.edit')}
                  aria-label={t('actions.editAria')}
                  disabled={busy}
                  onClick={() => onEdit(channel)}
                >
                  <EditIcon className="size-4" />
                </Button>
              ) : null}
              {isPaused && onResume ? (
                <Button
                  variant="outlined"
                  size="icon"
                  className="size-8 rounded-lg"
                  title={resuming ? t('actions.resuming') : t('actions.resume')}
                  aria-label={resuming ? t('actions.resumingAria') : t('actions.resume')}
                  disabled={busy}
                  onClick={() => onResume(channel)}
                >
                  <ResumeIcon className="size-3.5" />
                </Button>
              ) : onPause ? (
                <Button
                  variant="outlined"
                  size="icon"
                  className="size-8 rounded-lg"
                  title={
                    isDeleted
                      ? t('actions.channelDeleted')
                      : pausing
                        ? t('actions.pausing')
                        : t('actions.pause')
                  }
                  aria-label={pausing ? t('actions.pausingAria') : t('actions.pause')}
                  disabled={isDeleted || busy}
                  onClick={() => onPause(channel)}
                >
                  <StopIcon className="size-3.5" />
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  variant="danger"
                  size="icon"
                  className="size-8 rounded-lg"
                  title={deleting ? tCommon('actions.deleting') : t('actions.deleteChannel')}
                  aria-label={
                    deleting ? t('actions.deletingChannel') : t('actions.deleteChannel')
                  }
                  disabled={busy}
                  onClick={() => onDelete(channel)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [
      t,
      i18n.language,
      sources,
      niches,
      onSelect,
      openingProfileIds,
      onOpenProfile,
      onEdit,
      onPause,
      onResume,
      onDelete,
      pausingChannelId,
      resumingChannelId,
      deletingChannelId,
      tCommon,
    ],
  )

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
      emptyMessage={t('table.empty')}
    />
  )
}
