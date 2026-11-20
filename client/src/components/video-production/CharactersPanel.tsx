import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, ImageUp, Loader2 } from 'lucide-react';
import type { ProductionCharacterItem } from '../../types/videoProductionScenes';

interface CharactersPanelProps {
  characters: ProductionCharacterItem[];
  loading: boolean;
  error: string | null;
  /** Extra card rendered first in the grid (e.g. a draft for a new character). */
  leadingItem?: ReactNode;
  /** Drop the panel's own outer padding (when the host already pads the content). */
  flush?: boolean;
  /** When set, hovering an image shows a button to replace it with a picked file. */
  onReplaceImage?: (character: ProductionCharacterItem, file: File) => Promise<void>;
}

function CharacterImage({
  character,
  onReplace,
}: {
  character: ProductionCharacterItem;
  onReplace?: (file: File) => Promise<void>;
}) {
  const { t } = useTranslation('factory');
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const showImage = Boolean(character.imageUrl) && !failed;

  async function pick(file: File | undefined) {
    if (!file || !onReplace) return;
    setUploading(true);
    try {
      await onReplace(file);
      setFailed(false);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="group relative h-[180px] w-full overflow-hidden rounded-md bg-muted">
      {onReplace ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-sm font-medium text-white transition-opacity ${
              uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-black/40 px-3 py-1.5">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
              {uploading ? t('production.characters.uploading') : t('production.characters.replaceImage')}
            </span>
          </button>
        </>
      ) : null}
      {showImage ? (
        <img
          src={character.imageUrl ?? undefined}
          alt={character.name}
          loading="lazy"
          className={`size-full ${character.isMascot ? 'object-contain' : 'object-cover'}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageOff className="size-6" aria-hidden="true" />
          <span className="text-sm">{t('production.characters.noImage')}</span>
        </div>
      )}
    </div>
  );
}

export function CharactersPanel({ characters, loading, error, leadingItem, flush = false, onReplaceImage }: CharactersPanelProps) {
  const { t } = useTranslation('factory');
  const messagePadding = flush ? 'py-4' : 'px-4 py-6';

  if (loading) {
    return (
      <p className={`${messagePadding} text-sm text-muted-foreground`}>
        {t('production.characters.loading')}
      </p>
    );
  }

  if (error) {
    return <p className={`${messagePadding} text-sm text-danger`}>{error}</p>;
  }

  if (characters.length === 0 && !leadingItem) {
    return (
      <p className={`${messagePadding} text-sm text-muted-foreground`}>
        {t('production.characters.empty')}
      </p>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${flush ? '' : 'p-4'}`}>
      {leadingItem}
      {characters.map((character) => (
        <article
          key={character.isMascot ? `mascot:${character.id}` : character.id}
          className={`overflow-hidden rounded-xl border bg-surface ${
            character.isMascot ? 'border-primary-400/50' : 'border-border'
          }`}
        >
          <CharacterImage
            character={character}
            onReplace={onReplaceImage ? (file) => onReplaceImage(character, file) : undefined}
          />
          <div className="space-y-2 p-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {character.isMascot ? t('production.characters.mascotBadge') : character.name}
              </h3>
              {character.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{character.description}</p>
              ) : null}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {character.isMascot
                ? t(onReplaceImage ? 'production.characters.mascotReplaceHint' : 'production.characters.mascotHint')
                : character.prompt || t('production.characters.noPrompt')}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
