import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import {
  productionVideoKey,
  type ProductionVideoListItem,
} from '../../types/videoProductionScenes';

interface VideoProductionListProps {
  videos: ProductionVideoListItem[];
  selectedKey: string | null;
  loading: boolean;
  hasChannel: boolean;
  onSelect: (video: ProductionVideoListItem) => void;
}

function VideoThumb({ video }: { video: ProductionVideoListItem }) {
  const { t } = useTranslation('factory');
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(video.thumbnailUrl) && !failed;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {showImage ? (
        <img
          src={video.thumbnailUrl ?? undefined}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="text-xs">{t('production.list.noThumbnail')}</span>
        </div>
      )}
    </div>
  );
}

export function VideoProductionList({
  videos,
  selectedKey,
  loading,
  hasChannel,
  onSelect,
}: VideoProductionListProps) {
  const { t } = useTranslation('factory');

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('production.list.loading')}
      </p>
    );
  }

  if (!hasChannel) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('production.list.selectChannel')}
      </p>
    );
  }

  if (videos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('production.list.empty')}
      </p>
    );
  }

  return (
    <ul className="space-y-4 p-2">
      {videos.map((video) => {
        const key = productionVideoKey(video);
        const selected = key === selectedKey;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect(video)}
              className={cn(
                'w-full cursor-pointer rounded-xl p-1.5 text-left transition-colors duration-150',
                selected ? 'bg-primary-500/10 ring-1 ring-primary-500/40' : 'hover:bg-surface-elevated',
              )}
            >
              <VideoThumb video={video} />
              <p className="mt-2 line-clamp-2 px-0.5 text-sm font-medium leading-snug text-foreground">
                {video.title}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
