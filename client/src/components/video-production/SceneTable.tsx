import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, ImageOff, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, Modal, MultiSelect } from '../ui';
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
  onChange,
}: {
  scene: ProductionSceneItem;
  regenerating: boolean;
  disabled: boolean;
  error: string | null;
  onRegenerate: () => void;
  onChange: () => void;
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

        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            disabled={regenerating || disabled}
            onClick={(event) => {
              event.stopPropagation();
              onChange();
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
}: SceneTableProps) {
  const { t } = useTranslation('factory');
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});
  const [changeIndex, setChangeIndex] = useState<number | null>(null);

  const busy = regeneratingIndex !== null || regeneratingMissing;

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
                  <ScenePromptEditor
                    key={`${scene.index}:${scene.prompt}:${(scene.references ?? []).join(',')}`}
                    channelId={channelId}
                    videoId={videoId}
                    scene={scene}
                    characters={characters}
                    onScenesUpdated={onScenesUpdated}
                    imagesUpdate={(data) => keepCacheBustedUrls(data, scenes)}
                  />
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
                    onChange={() => setChangeIndex(scene.index)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <SceneImageChangeModal
        key={changeIndex ?? 'closed'}
        open={changeIndex !== null}
        sceneNumber={(changeIndex ?? 0) + 1}
        onClose={() => setChangeIndex(null)}
        onConfirm={async (file) => {
          if (changeIndex === null) return;
          const data = await replaceProductionSceneImage(channelId, videoId, changeIndex, file);
          const bust = Date.now();
          const merged = keepCacheBustedUrls(data, scenes);
          onScenesUpdated({
            ...merged,
            scenes: merged.scenes.map((scene) =>
              scene.index === changeIndex
                ? { ...scene, imageUrl: withCacheBust(data.scenes[scene.index]?.imageUrl ?? null, bust) }
                : scene,
            ),
          });
          setChangeIndex(null);
        }}
      />
    </div>
  );
}

function SceneImageChangeModal({
  open,
  sceneNumber,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sceneNumber: number;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation('factory');
  const { t: tCommon } = useTranslation('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(file);
    } catch (err) {
      setError(
        err instanceof Error && err.message.trim() ? err.message : t('production.scene.changeError'),
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={t('production.scene.changeTitle', { n: sceneNumber })}
      className="max-w-lg"
      footer={
        <>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg"
            onClick={onClose}
            disabled={submitting}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            onClick={() => void submit()}
            disabled={!file || submitting}
          >
            {submitting ? t('production.scene.changing') : t('production.scene.changeConfirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground hover:bg-surface-elevated"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-sm">
              <ImagePlus className="size-6" aria-hidden="true" />
              {t('production.scene.choosePicture')}
            </span>
          )}
        </button>
        {file ? <p className="truncate text-xs text-muted-foreground">{file.name}</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
