import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { StoredYoutubeChannelType } from '../../types/youtubeChannel'

const config: Record<
  StoredYoutubeChannelType,
  { labelKey: string; dot: string; text: string; bg: string }
> = {
  content: {
    labelKey: 'type.content',
    dot: 'bg-neutral-400',
    text: 'text-neutral-300',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
  reup_audio: {
    labelKey: 'type.reupAudio',
    dot: 'bg-primary-400',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  reup_video: {
    labelKey: 'type.reupVideo',
    dot: 'bg-secondary-400',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
  content_sale: {
    labelKey: 'type.contentSale',
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  reup: {
    labelKey: 'type.reup',
    dot: 'bg-secondary-400',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
}

interface ChannelTypePillProps {
  type: StoredYoutubeChannelType
  className?: string
}

export function ChannelTypePill({ type, className }: ChannelTypePillProps) {
  const { t } = useTranslation('youtube')
  const c = config[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.bg,
        c.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', c.dot)} />
      {t(c.labelKey)}
    </span>
  )
}
