import { CalendarClock, Clock, Eye, Globe, Heart, MessageCircle, Star, Users, Video } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { YoutubeChannel, YoutubeChannelVideo } from '../../types/youtubeChannel'
import {
  formatCompact,
  formatNumber,
  LEVEL_THRESHOLDS,
  levelColor,
  levelFor,
  YPP_HOURS,
  YPP_SUBSCRIBERS,
  yppPercent,
} from '../../utils/ypp'
import { ChannelTypePill } from './ChannelTypePill'
import { MonetizationPill } from './MonetizationPill'

interface YoutubeChannelHeroProps {
  channel: YoutubeChannel
  videos: YoutubeChannelVideo[]
}

function Meter({
  label,
  value,
  target,
  color,
  hint,
}: {
  label: string
  value: number
  target: number
  color: string
  hint?: string
}) {
  const percent = Math.min(100, (value / target) * 100)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="section-label">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {formatNumber(value)} / {formatNumber(target)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(to right, ${color}, color-mix(in srgb, ${color} 55%, white))`,
          }}
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-muted)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums text-foreground">{Math.round(percent)}%</span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">YPP</span>
      </div>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card-surface rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="section-label">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  )
}

export function YoutubeChannelHero({ channel, videos }: YoutubeChannelHeroProps) {
  const { t, i18n } = useTranslation('youtube')

  const hasMetrics = channel.watchHours !== undefined || channel.subscribers !== undefined
  const hours = channel.watchHours ?? 0
  const subs = channel.subscribers ?? 0
  const level = levelFor(hours)
  const color = levelColor(level)
  const eligible = hours >= YPP_HOURS && subs >= YPP_SUBSCRIBERS
  const nextTarget = LEVEL_THRESHOLDS[level]
  const percent = yppPercent(hours, subs)

  const published = videos.filter((v) => v.status === 'Published' || v.status === 'Uploaded')
  const totalViews = videos.reduce((sum, v) => sum + (v.viewCount ?? 0), 0)
  const totalLikes = videos.reduce((sum, v) => sum + (v.likeCount ?? 0), 0)
  const totalComments = videos.reduce((sum, v) => sum + (v.commentCount ?? 0), 0)

  const nextUpload = channel.nextUploadAt
    ? new Date(channel.nextUploadAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="space-y-3">
      <div
        className="kpi-card p-5"
        style={{ '--kpi': eligible ? 'var(--color-primary-500)' : color } as CSSProperties}
      >
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="relative flex size-28 shrink-0 items-center justify-center"
            style={{
              clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
              background: `linear-gradient(160deg, color-mix(in srgb, ${color} 85%, white), ${color})`,
            }}
          >
            <span className="text-3xl font-black tracking-tight text-on-primary">
              {channel.handle.replace(/^@/, '').slice(0, 3).toUpperCase()}
            </span>
            <span className="absolute bottom-4 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              {t('cards.level', { level })}
            </span>
          </div>

          <div className="min-w-[16rem] flex-1">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{channel.name}</h2>
            <p className="text-sm text-muted-foreground">
              <a
                href={channel.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground hover:underline"
              >
                {channel.youtubeUrl.replace(/^https?:\/\//, '')}
              </a>
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <MonetizationPill status={channel.monetizationStatus} />
              <ChannelTypePill type={channel.type} />
              {channel.language ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 text-xs text-muted-foreground">
                  <Globe className="size-3" />
                  {t(`language.${channel.language}`)}
                </span>
              ) : null}
              {eligible ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary-500/40 bg-primary-500/10 px-2.5 py-0.5 text-xs font-medium text-primary-400">
                  <Star className="size-3" />
                  {t('cards.ypp')}
                </span>
              ) : null}
              {nextUpload ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 text-xs text-muted-foreground">
                  <CalendarClock className="size-3" />
                  {t('hero.nextUpload', { time: nextUpload })}
                </span>
              ) : null}
            </div>

            {hasMetrics ? (
              <div className="mt-4 space-y-3">
                <Meter
                  label={t('hero.watchHoursLabel')}
                  value={hours}
                  target={YPP_HOURS}
                  color={color}
                  hint={
                    eligible
                      ? t('hero.hoursEnough')
                      : nextTarget !== undefined
                        ? t('cards.hoursLeft', {
                            next: level + 1,
                            target: formatNumber(nextTarget),
                            left: formatNumber(Math.max(0, nextTarget - hours)),
                          })
                        : undefined
                  }
                />
                <Meter
                  label={t('hero.subscribersLabel')}
                  value={subs}
                  target={YPP_SUBSCRIBERS}
                  color="var(--color-danger)"
                />
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-muted/60 px-3 py-3 text-xs text-muted-foreground">
                {t('cards.noData')}
              </p>
            )}
          </div>

          {hasMetrics ? (
            <div className="flex items-center gap-4">
              <ProgressRing percent={percent} color={eligible ? 'var(--color-primary-500)' : color} />
              <div className="max-w-[11rem]">
                <p className="section-label">{t('hero.yppProgress')}</p>
                <p className="mt-1 text-sm text-foreground">
                  {eligible
                    ? t('hero.eligible')
                    : t('hero.remaining', {
                        hours: formatNumber(Math.max(0, YPP_HOURS - hours)),
                        subs: formatNumber(Math.max(0, YPP_SUBSCRIBERS - subs)),
                      })}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Eye className="size-3.5" />} label={t('hero.totalViews')} value={formatCompact(totalViews)} />
        <Kpi
          icon={<Clock className="size-3.5" />}
          label={t('hero.watchHours')}
          value={channel.watchHours !== undefined ? formatNumber(hours) : '—'}
        />
        <Kpi
          icon={<Users className="size-3.5" />}
          label={t('hero.subscribers')}
          value={channel.subscribers !== undefined ? formatNumber(subs) : '—'}
        />
        <Kpi
          icon={<Video className="size-3.5" />}
          label={t('hero.publishedVideos')}
          value={`${published.length}/${videos.length}`}
        />
        <Kpi icon={<Heart className="size-3.5" />} label={t('hero.likes')} value={formatCompact(totalLikes)} />
        <Kpi icon={<MessageCircle className="size-3.5" />} label={t('hero.comments')} value={formatCompact(totalComments)} />
      </div>
    </div>
  )
}
