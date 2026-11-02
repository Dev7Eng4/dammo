import { AlertTriangle, Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { VideoAgentRun } from '../../types/videoAgent'
import { Button } from '../ui'
import { similarityPasses } from './scriptChecks'

const MIN_MINUTES = 12
const MAX_MINUTES = 30

type CheckState = 'ok' | 'warn' | 'unknown'

function CheckRow({ state, label, detail }: { state: CheckState; label: string; detail?: ReactNode }) {
  const Icon = state === 'ok' ? Check : state === 'warn' ? AlertTriangle : Minus
  return (
    <li className="flex items-start gap-2">
      <Icon
        className={
          state === 'ok'
            ? 'mt-0.5 size-3.5 shrink-0 text-success'
            : state === 'warn'
              ? 'mt-0.5 size-3.5 shrink-0 text-warning'
              : 'mt-0.5 size-3.5 shrink-0 text-muted-foreground'
        }
      />
      <span className="min-w-0 text-xs">
        <span className="text-foreground">{label}</span>
        {detail ? <span className="ml-1 text-muted-foreground">{detail}</span> : null}
      </span>
    </li>
  )
}

interface ApprovalStepProps {
  run: VideoAgentRun
  disabled: boolean
  approved: boolean
  onApprove: () => void
}

/**
 * The producer's gate before any voice is made, at the foot of the script tab: the checks the approval
 * rests on, then the button. The script itself and its summary are right above it.
 */
export function ApprovalStep({ run, disabled, approved, onApprove }: ApprovalStepProps) {
  const { t } = useTranslation('manual')
  const script = run.script
  if (!script) return null

  const hasSources = script.similarity.length > 0
  const inWindow = script.estimatedMinutes >= MIN_MINUTES && script.estimatedMinutes <= MAX_MINUTES
  const freshness = script.freshness
  const worst = script.similarity.reduce((max, item) => Math.max(max, item.gram8), 0)

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="rounded-lg border border-border p-3">
        <p className="text-sm font-semibold text-foreground">{t('step.approval.title')}</p>
        <p className="text-xs text-muted-foreground">{t('step.approval.checklist')}</p>
        <ul className="mt-2 space-y-1.5">
          <CheckRow
            state={!hasSources ? 'unknown' : similarityPasses(script) ? 'ok' : 'warn'}
            label={t('step.approval.checks.similarity')}
            detail={hasSources ? t('step.approval.checks.similarityDetail', { value: worst }) : t('step.approval.checks.notMeasured')}
          />
          <CheckRow
            state={!freshness || freshness.compared === 0 ? 'unknown' : freshness.pass ? 'ok' : 'warn'}
            label={t('step.approval.checks.channel')}
            detail={
              freshness && freshness.compared > 0
                ? t('step.approval.checks.channelDetail', { count: freshness.compared })
                : t('step.approval.checks.noEarlier')
            }
          />
          <CheckRow
            state={inWindow ? 'ok' : 'warn'}
            label={t('step.approval.checks.length')}
            detail={t('step.approval.checks.lengthDetail', { minutes: script.estimatedMinutes, min: MIN_MINUTES, max: MAX_MINUTES })}
          />
        </ul>
      </div>

      <div className="space-y-2">
        <Button size="sm" disabled={disabled || approved} onClick={onApprove}>
          <Check className="size-4" />
          {approved ? t('step.approval.done') : t('step.approval.approve')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('step.approval.effect')}</p>
      </div>
    </div>
  )
}
