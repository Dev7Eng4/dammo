import { Activity } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import type { SystemHealth } from '../../types/dashboard'

interface SystemHealthPanelProps {
  data?: SystemHealth
  loading?: boolean
}

const GB = 1024 ** 3

type Level = 'ok' | 'warning' | 'danger'

const levelColor: Record<Level, string> = {
  ok: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
}

function levelFor(freeBytes: number, warningBytes: number, dangerBytes: number): Level {
  if (freeBytes < dangerBytes) return 'danger'
  if (freeBytes < warningBytes) return 'warning'
  return 'ok'
}

function Meter({
  label,
  freeBytes,
  totalBytes,
  level,
}: {
  label: string
  freeBytes: number
  totalBytes: number
  level: Level
}) {
  const percentFree = totalBytes > 0 ? Math.min(100, (freeBytes / totalBytes) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="section-label">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {(freeBytes / GB).toFixed(1)} / {(totalBytes / GB).toFixed(0)} GB
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percentFree)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percentFree}%`, background: levelColor[level] }}
        />
      </div>
    </div>
  )
}

export function SystemHealthPanel({ data, loading }: SystemHealthPanelProps) {
  const { t } = useTranslation('dashboard')

  const ramLevel = data ? levelFor(data.ram.freeBytes, 3 * GB, 1.5 * GB) : 'ok'
  const diskLevel = data?.disk ? levelFor(data.disk.freeBytes, 15 * GB, 5 * GB) : 'ok'
  const overall: Level = [ramLevel, diskLevel].includes('danger')
    ? 'danger'
    : [ramLevel, diskLevel].includes('warning')
      ? 'warning'
      : 'ok'

  return (
    <div className="kpi-card p-4" style={{ '--kpi': levelColor[overall] } as CSSProperties}>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4" style={{ color: levelColor[overall] }} />
        <p className="section-label">{t('system.title')}</p>
      </div>

      {loading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Meter label={t('system.ram')} freeBytes={data.ram.freeBytes} totalBytes={data.ram.totalBytes} level={ramLevel} />
          {data.disk ? (
            <Meter label={t('system.disk')} freeBytes={data.disk.freeBytes} totalBytes={data.disk.totalBytes} level={diskLevel} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('system.disk')}: {t('system.unavailable')}
            </p>
          )}
          <Link
            to="/task-queue"
            className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs transition-colors hover:bg-muted"
          >
            <span className="section-label">{t('system.queue')}</span>
            <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
              <span className="text-info">{data.queue.running} {t('system.running')}</span>
              <span>{data.queue.queued} {t('system.queued')}</span>
              <span className={cn(data.queue.failed > 0 && 'font-semibold text-danger')}>
                {data.queue.failed} {t('system.failed')}
              </span>
              {data.queue.paused ? <span className="text-warning">{t('system.paused')}</span> : null}
            </span>
          </Link>
        </div>
      )}
    </div>
  )
}
