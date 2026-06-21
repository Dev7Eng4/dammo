import { cn } from '../../lib/cn';
import { YOUTUBE_CHANNEL_TYPE_LABELS, type StoredYoutubeChannelType } from '../../types/youtubeChannel';

const config: Record<
  StoredYoutubeChannelType,
  { label: string; dot: string; text: string; bg: string }
> = {
  content: {
    label: YOUTUBE_CHANNEL_TYPE_LABELS.content,
    dot: 'bg-neutral-400',
    text: 'text-neutral-300',
    bg: 'bg-neutral-500/10 border-neutral-500/30',
  },
  reup_audio: {
    label: YOUTUBE_CHANNEL_TYPE_LABELS.reup_audio,
    dot: 'bg-primary-400',
    text: 'text-primary-300',
    bg: 'bg-primary-400/10 border-primary-400/30',
  },
  reup_video: {
    label: YOUTUBE_CHANNEL_TYPE_LABELS.reup_video,
    dot: 'bg-secondary-400',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
  content_sale: {
    label: YOUTUBE_CHANNEL_TYPE_LABELS.content_sale,
    dot: 'bg-warning',
    text: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
  },
  reup: {
    label: YOUTUBE_CHANNEL_TYPE_LABELS.reup,
    dot: 'bg-secondary-400',
    text: 'text-secondary-300',
    bg: 'bg-secondary-400/10 border-secondary-400/30',
  },
};

interface ChannelTypePillProps {
  type: StoredYoutubeChannelType;
  className?: string;
}

export function ChannelTypePill({ type, className }: ChannelTypePillProps) {
  const c = config[type];
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
      {c.label}
    </span>
  );
}
