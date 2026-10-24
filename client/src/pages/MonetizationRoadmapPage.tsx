import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader, PageShell } from '../components/layout'
import { StatusBadge, type StatusTone } from '../components/ui'
import {
  PHASE_IDS,
  SCORE_KEYS,
  STEP_KEYS,
  rankedTracks,
  trackTotal,
  type TrackTier,
} from '../config/monetization'
import { cn } from '../lib/cn'

const TIER_TONE: Record<TrackTier, StatusTone> = {
  now: 'success',
  next: 'info',
  later: 'neutral',
}

const AI_MODULE_KEYS = ['radar', 'prompts', 'production', 'accounts'] as const
const MAX_SCORE = 5

function ScoreDots({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${label}: ${value}/${MAX_SCORE}`}>
      {Array.from({ length: MAX_SCORE }, (_, i) => (
        <span
          key={i}
          className={cn('size-2 rounded-full', i < value ? 'bg-primary-500' : 'bg-muted')}
        />
      ))}
    </div>
  )
}

export function MonetizationRoadmapPage() {
  const { t } = useTranslation('roadmap')
  const tracks = rankedTracks()

  return (
    <PageShell>
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} icon={TrendingUp} />

      <section className="card-surface space-y-2 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('pick.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('pick.body')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('table.title')}</h2>
        <div className="card-surface scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('table.track')}</th>
                {SCORE_KEYS.map((key) => (
                  <th key={key} className="px-4 py-3 font-medium">
                    {t(`score.${key}`)}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">{t('score.total')}</th>
                <th className="px-4 py-3 font-medium">{t('table.tier')}</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {t(`track.${track.id}.name`)}
                  </td>
                  {SCORE_KEYS.map((key) => (
                    <td key={key} className="px-4 py-3">
                      <ScoreDots value={track.scores[key]} label={t(`score.${key}`)} />
                    </td>
                  ))}
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {trackTotal(track)}/{SCORE_KEYS.length * MAX_SCORE}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={TIER_TONE[track.tier]} label={t(`tier.${track.tier}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('detail.title')}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {tracks.map((track) => (
            <article key={track.id} className="card-surface space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  {t(`track.${track.id}.name`)}
                </h3>
                <StatusBadge tone={TIER_TONE[track.tier]} label={t(`tier.${track.tier}`)} />
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('detail.summary')}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {t(`track.${track.id}.summary`)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('detail.aiRole')}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {t(`track.${track.id}.aiRole`)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('detail.steps')}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
                  {STEP_KEYS.map((step) => (
                    <li key={step}>{t(`track.${track.id}.${step}`)}</li>
                  ))}
                </ol>
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">{t('detail.risk')}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {t(`track.${track.id}.risk`)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('phase.title')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PHASE_IDS.map((phase) => (
            <div key={phase} className="card-surface space-y-2 p-5">
              <h3 className="text-sm font-semibold text-foreground">{t(`phase.${phase}.name`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`phase.${phase}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('ai.title')}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {AI_MODULE_KEYS.map((key) => (
            <li key={key}>{t(`ai.${key}`)}</li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">{t('page.disclaimer')}</p>
    </PageShell>
  )
}
