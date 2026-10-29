import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, ImageOff, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { MultiSelect } from '../ui';
import {
  regenerateProductionSceneImage,
  replaceProductionSceneImage,
  updateProductionScene,
} from '../../api/videoProduction';
import type {
  ProductionCharacterItem,
  ProductionSceneItem,
  ProductionScenesResponse,
} from '../../types/videoProductionScenes';

interface SceneTableProps {
  channelId: string;
  videoId: string;
  scenes: ProductionSceneItem[];
  characters: ProductionCharacterItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onScenesUpdated: (data: ProductionScenesResponse) => void;
  regeneratingMissing?: boolean;
  /** Drop the table's own side offset (when the host already pads the content). */
  flush?: boolean;
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
  disabled,
  error,
  onRegenerate,
  onPickFile,
}: {
  scene: ProductionSceneItem;
  regenerating: boolean;
  disabled: boolean;
  error: string | null;
  onRegenerate: () => void;
  onPickFile: (file: File) => void;
}) {
  const { t } = useTranslation('factory');
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(scene.imageUrl) && !imageFailed;
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onPickFile(file);
          }}
        />

        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            disabled={regenerating || disabled}
            onClick={(event) => {
              event.stopPropagation();
              fileInputRef.current?.click();
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm',
              'hover:bg-background disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <ImagePlus className="size-3.5" aria-hidden="true" />
            {t('production.scene.change')}
          </button>
          <button
            type="button"
            disabled={regenerating || disabled}
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

function keepCacheBustedUrls(
  data: ProductionScenesResponse,
  previous: ProductionSceneItem[],
): ProductionScenesResponse {
  const previousByIndex = new Map(previous.map((scene) => [scene.index, scene]));
  return {
    ...data,
    scenes: data.scenes.map((scene) => {
      const previousUrl = previousByIndex.get(scene.index)?.imageUrl;
      return scene.imageUrl && previousUrl ? { ...scene, imageUrl: previousUrl } : scene;
    }),
  };
}

function ScenePromptEditor({
  channelId,
  videoId,
  scene,
  characters,
  onScenesUpdated,
  imagesUpdate,
}: {
  channelId: string;
  videoId: string;
  scene: ProductionSceneItem;
  characters: ProductionCharacterItem[];
  onScenesUpdated: (data: ProductionScenesResponse) => void;
  imagesUpdate: (data: ProductionScenesResponse) => ProductionScenesResponse;
}) {
  const { t } = useTranslation('factory');
  const initialRefs = scene.references ?? [];
  const [prompt, setPrompt] = useState(scene.prompt);
  const [refs, setRefs] = useState<string[]>(initialRefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const promptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = promptRef.current;
    if (!editing || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const dirty =
    prompt.trim() !== scene.prompt.trim() ||
    refs.length !== initialRefs.length ||
    refs.some((ref, i) => ref !== initialRefs[i]);
  // Keep ids that are no longer in character-references.json selectable so they can be removed.
  const referenceOptions = [
    ...characters.map((character) => ({ value: character.id, label: character.name })),
    ...refs
      .filter((ref) => !characters.some((character) => character.id === ref))
      .map((ref) => ({ value: ref, label: ref })),
  ];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await updateProductionScene(channelId, videoId, scene.index, {
        prompt,
        references: refs,
      });
      onScenesUpdated(imagesUpdate(data));
    } catch (err) {
      setError(
        err instanceof Error && err.message.trim() ? err.message : t('production.scene.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      <div
        ref={promptRef}
        role="textbox"
        aria-multiline="true"
        tabIndex={0}
        contentEditable={editing ? 'plaintext-only' : false}
        suppressContentEditableWarning
        onClick={() => {
          if (!editing) setEditing(true);
        }}
        onFocus={() => {
          if (!editing) setEditing(true);
        }}
        onBlur={(event) => {
          setPrompt(event.currentTarget.innerText.replace(/\n$/, ''));
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.innerText = prompt;
            event.currentTarget.blur();
          }
        }}
        title={editing ? undefined : t('production.scene.clickToEdit')}
        className={cn(
          'min-h-[3rem] w-full rounded-md border p-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 outline-none',
          editing
            ? 'cursor-text border-primary-500 bg-background ring-1 ring-primary-500'
            : 'cursor-pointer border-transparent hover:border-border hover:bg-surface-elevated',
        )}
      >
        {prompt || (editing ? '' : t('production.scene.noPrompt'))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" aria-hidden="true" />
          {t('production.scene.references')}:
        </span>
      </div>
      <MultiSelect
        value={refs}
        onChange={setRefs}
        options={referenceOptions}
        placeholder={t('production.scene.addReference')}
        disabled={referenceOptions.length === 0}
      />

      {dirty || editing ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {t('production.scene.save')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setPrompt(scene.prompt);
              setRefs(initialRefs);
            }}
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('production.scene.cancel')}
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SceneTable({
  channelId,
  videoId,
  scenes,
  characters,
  selectedIndex,
  onSelect,
  onScenesUpdated,
  regeneratingMissing = false,
  flush = false,
}: SceneTableProps) {
  const { t } = useTranslation('factory');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});

  const busy = regeneratingIndex !== null || regeneratingMissing;

  const handlePickFile = async (sceneIndex: number, file: File) => {
    if (busy) return;

    setRegeneratingIndex(sceneIndex);
    setErrorsByIndex((prev) => {
      const next = { ...prev };
      delete next[sceneIndex];
      return next;
    });

    try {
      const data = await replaceProductionSceneImage(channelId, videoId, sceneIndex, file);
      const bust = Date.now();
      const merged = keepCacheBustedUrls(data, scenes);
      onScenesUpdated({
        ...merged,
        scenes: merged.scenes.map((scene) =>
          scene.index === sceneIndex
            ? { ...scene, imageUrl: withCacheBust(data.scenes[scene.index]?.imageUrl ?? null, bust) }
            : scene,
        ),
      });
    } catch (err) {
      setErrorsByIndex((prev) => ({
        ...prev,
        [sceneIndex]:
          err instanceof Error && err.message.trim()
            ? err.message
            : t('production.scene.changeError'),
      }));
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleRegenerate = async (sceneIndex: number) => {
    if (busy) return;

    setRegeneratingIndex(sceneIndex);
    setErrorsByIndex((prev) => {
      const next = { ...prev };
      delete next[sceneIndex];
      return next;
    });

    try {
      const data = await regenerateProductionSceneImage(channelId, videoId, sceneIndex);
      const bust = Date.now();
      const previousByIndex = new Map(scenes.map((scene) => [scene.index, scene]));
      onScenesUpdated({
        ...data,
        scenes: data.scenes.map((scene) => {
          if (scene.index === sceneIndex) {
            return { ...scene, imageUrl: withCacheBust(scene.imageUrl, bust) };
          }
          // Keep the already cache-busted URL of untouched scenes so their <img> does not
          // remount and possibly fall back to a stale cached image.
          const previousUrl = previousByIndex.get(scene.index)?.imageUrl;
          return scene.imageUrl && previousUrl ? { ...scene, imageUrl: previousUrl } : scene;
        }),
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
    <div className={flush ? '-mx-3 overflow-x-auto' : 'overflow-x-auto'}>
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
                  {scene.type === 'title' ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {t('production.scene.titleCard')}
                      </p>
                      <p className="text-base font-semibold">{scene.title}</p>
                    </div>
                  ) : (
                    <ScenePromptEditor
                      key={`${scene.index}:${scene.prompt}:${(scene.references ?? []).join(',')}`}
                      channelId={channelId}
                      videoId={videoId}
                      scene={scene}
                      characters={characters}
                      onScenesUpdated={onScenesUpdated}
                      imagesUpdate={(data) => keepCacheBustedUrls(data, scenes)}
                    />
                  )}
                </td>
                <td className="w-[500px] px-3 py-3">
                  <SceneImageCell
                    key={scene.imageUrl ?? `scene-${scene.index}`}
                    scene={scene}
                    regenerating={
                      regeneratingIndex === scene.index || (regeneratingMissing && !scene.imageUrl)
                    }
                    disabled={busy}
                    error={errorsByIndex[scene.index] ?? null}
                    onRegenerate={() => void handleRegenerate(scene.index)}
                    onPickFile={(file) => void handlePickFile(scene.index, file)}
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
