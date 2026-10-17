import { CalendarClock } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { UpcomingUpload } from '../../types/dashboard'

interface UpcomingUploadsProps {
  items: UpcomingUpload[]
  loading?: boolean
}

export function UpcomingUploads({ items, loading }: UpcomingUploadsProps) {
  const { t, i18n } = useTranslation('dashboard')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function countdown(iso: string) {
    const diffMin = Math.floor((new Date(iso).getTime() - now) / 60_000)
    if (diffMin <= 0) return t('upcoming.now')
    const d = Math.floor(diffMin / 1440)
    const h = Math.floor((diffMin % 1440) / 60)
    const m = diffMin % 60
    const time =
      d > 0
        ? t('upcoming.days', { d, h })
        : h > 0
          ? t('upcoming.hours', { h, m })
          : t('upcoming.minutes', { m })
    return t('upcoming.inTime', { time })
  }

  return (
    <div className="kpi-card p-4" style={{ '--kpi': 'var(--color-info)' } as CSSProperties}>
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-info" />
        <p className="section-label">{t('upcoming.title')}</p>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('upcoming.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.channelId}>
              <Link
                to={`/youtube-channels/${item.channelId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(item.at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-info">
                  {countdown(item.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
