import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { regenerateProductionSceneImage } from '../../api/videoProduction';
import type {
  ProductionSceneItem,
  ProductionScenesResponse,
} from '../../types/videoProductionScenes';

interface SceneTableProps {
  channelId: string;
  videoId: string;
  scenes: ProductionSceneItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onScenesUpdated: (data: ProductionScenesResponse) => void;
}

function formatClock(srt: string): string {
  const base = srt.replace(',', '.');
  const [hms] = base.split('.');
  return hms ?? srt;
}

function withCacheBust(url: string | null, version: number): string | null {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version}`;
}

function SceneImageCell({
  scene,
  regenerating,
  error,
  onRegenerate,
}: {
  scene: ProductionSceneItem;
  regenerating: boolean;
  error: string | null;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation('factory');
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(scene.imageUrl) && !imageFailed;

  return (
    <div className="space-y-1.5">
      <div className="group relative h-[272px] w-[480px] overflow-hidden rounded-md bg-muted">
        {showImage ? (
          <img
            key={scene.imageUrl ?? scene.index}
            src={scene.imageUrl ?? undefined}
            alt={`Scene ${scene.index + 1}`}
            loading="lazy"
            className={cn('size-full object-cover', regenerating && 'opacity-40')}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
            <span className="text-sm">{t('production.scene.noImage')}</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            disabled={regenerating}
            onClick={(event) => {
              event.stopPropagation();
              onRegenerate();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm',
              'hover:bg-background disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {regenerating ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {regenerating
              ? t('production.scene.regenerating')
              : t('production.scene.regenerate')}
          </button>
        </div>

        {regenerating ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-foreground" aria-hidden="true" />
          </div>
        ) : null}
      </div>

      {error ? <p className="max-w-[480px] text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SceneTable({
  channelId,
  videoId,
  scenes,
  selectedIndex,
  onSelect,
  onScenesUpdated,
}: SceneTableProps) {
  const { t } = useTranslation('factory');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});

  const handleRegenerate = async (sceneIndex: number) => {
    if (regeneratingIndex !== null) return;

    setRegeneratingIndex(sceneIndex);
    setErrorsByIndex((prev) => {
      const next = { ...prev };
      delete next[sceneIndex];
      return next;
    });

    try {
      const data = await regenerateProductionSceneImage(channelId, videoId, sceneIndex);
      const bust = Date.now();
      onScenesUpdated({
        ...data,
        scenes: data.scenes.map((scene) =>
          scene.index === sceneIndex
            ? { ...scene, imageUrl: withCacheBust(scene.imageUrl, bust) }
            : scene,
        ),
      });
    } catch (err) {
      setErrorsByIndex((prev) => ({
        ...prev,
        [sceneIndex]:
          err instanceof Error && err.message.trim()
            ? err.message
            : t('production.scene.regenerateError'),
      }));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse text-left">
        <tbody className="divide-y divide-border">
          {scenes.map((scene) => {
            const selected = selectedIndex === scene.index;
            return (
              <tr
                key={scene.index}
                onClick={() => onSelect(scene.index)}
                className={cn(
                  'cursor-pointer align-top transition-colors duration-150',
                  selected ? 'bg-primary-500/10' : 'hover:bg-surface-elevated',
                )}
              >
                <td className="w-44 px-3 py-3 text-sm text-muted-foreground">
                  <div className="space-y-0.5">
                    <p>
                      {formatClock(scene.startTime)} – {formatClock(scene.endTime)}
                    </p>
                    <p>{scene.durationSec.toFixed(1)}s</p>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                    {scene.prompt || t('production.scene.noPrompt')}
                  </p>
                </td>
                <td className="w-[500px] px-3 py-3">
                  <SceneImageCell
                    key={scene.imageUrl ?? `scene-${scene.index}`}
                    scene={scene}
                    regenerating={regeneratingIndex === scene.index}
                    error={errorsByIndex[scene.index] ?? null}
                    onRegenerate={() => void handleRegenerate(scene.index)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
