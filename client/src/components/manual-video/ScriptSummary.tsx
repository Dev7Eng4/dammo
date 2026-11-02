import { useTranslation } from 'react-i18next'
import type { VideoAgentScript } from '../../types/videoAgent'
import { StatusBadge } from '../ui'
import { SIMILARITY_LIMITS, similarityPasses } from './scriptChecks'

/** What was measured on the saved script: length, wording similarity to the sources, comparison with the channel's earlier videos. */
export function ScriptSummary({ script }: { script: VideoAgentScript }) {
  const { t } = useTranslation('manual')
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
      <p className="text-sm font-semibold text-foreground">{t('script.summary.title')}</p>
      <p className="text-foreground/90">
        {t('script.summary.size', { chars: script.totalChars, minutes: script.estimatedMinutes, chapters: script.chapters.length })}
      </p>
      <p className="text-foreground/90">
        {t('script.summary.planned', { minutes: script.plannedMinutes })}
        {script.lengthReason ? ` — ${script.lengthReason}` : ''}
      </p>
      {script.similarity.length > 0 ? (
        <ul className="space-y-1">
          {script.similarity.map((item) => {
            const ok = item.gram8 <= SIMILARITY_LIMITS.gram8 && item.gram15 <= SIMILARITY_LIMITS.gram15
            return (
              <li key={item.sourceVideoId} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-muted-foreground">{item.sourceVideoId}</span>
                <span className="tabular-nums">8g {item.gram8}%</span>
                <span className="tabular-nums">15g {item.gram15}%</span>
                <StatusBadge tone={ok ? 'success' : 'danger'} label={ok ? t('script.summary.pass') : t('script.summary.over')} />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t('script.summary.noSimilarity')}</p>
      )}
      {script.freshness ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground/90">{t('script.summary.freshness', { count: script.freshness.compared })}</span>
            <StatusBadge
              tone={script.freshness.pass ? 'success' : 'warning'}
              label={script.freshness.pass ? t('script.summary.pass') : t('script.summary.needsWork')}
            />
          </div>
          {script.freshness.issues.map((issue, index) => (
            <p key={index} className="text-foreground/85">
              <span className="mr-1 uppercase text-muted-foreground">{issue.kind}</span>
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}
      {!similarityPasses(script) || script.freshness?.pass === false ? (
        <p className="text-warning">{t('script.summary.warn')}</p>
      ) : null}
    </div>
  )
}
