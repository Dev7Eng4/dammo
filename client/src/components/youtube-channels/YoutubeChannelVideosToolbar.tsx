import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DropdownSelect } from '../ui'
import type { YoutubeChannelVideoStatusFilter } from '../../types/youtubeChannel'

interface YoutubeChannelVideosToolbarProps {
  statusFilter: YoutubeChannelVideoStatusFilter
  onStatusFilterChange: (value: YoutubeChannelVideoStatusFilter) => void
  nextUploadAt?: string | null
}

function formatNextUploadAt(value: string | null | undefined, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
}

export function YoutubeChannelVideosToolbar({
  statusFilter,
  onStatusFilterChange,
  nextUploadAt,
}: YoutubeChannelVideosToolbarProps) {
  const { t, i18n } = useTranslation('youtube')

  const statusOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('filter.statusAll') },
      { value: 'Pending' as const, label: t('filter.statusPending') },
      { value: 'Published' as const, label: t('filter.statusPublished') },
      { value: 'Prepared' as const, label: t('filter.statusPrepared') },
      { value: 'Created' as const, label: t('filter.statusCreated') },
      { value: 'Draft' as const, label: t('filter.statusDraft') },
    ],
    [t],
  )

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="text-sm text-neutral-400">
        {t('detail.nextSchedule', { time: formatNextUploadAt(nextUploadAt, i18n.language) })}
      </p>
      <DropdownSelect options={statusOptions} value={statusFilter} onChange={onStatusFilterChange} />
    </div>
  )
}
