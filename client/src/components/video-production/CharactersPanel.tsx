import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff } from 'lucide-react';
import type { ProductionCharacterItem } from '../../types/videoProductionScenes';

interface CharactersPanelProps {
  characters: ProductionCharacterItem[];
  loading: boolean;
  error: string | null;
}

function CharacterImage({ character }: { character: ProductionCharacterItem }) {
  const { t } = useTranslation('factory');
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(character.imageUrl) && !failed;

  return (
    <div className="relative h-[180px] w-full overflow-hidden rounded-md bg-muted">
      {showImage ? (
        <img
          src={character.imageUrl ?? undefined}
          alt={character.name}
          loading="lazy"
          className="size-full object-cover"
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

export function CharactersPanel({ characters, loading, error }: CharactersPanelProps) {
  const { t } = useTranslation('factory');

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t('production.characters.loading')}
      </p>
    );
  }

  if (error) {
    return <p className="px-4 py-6 text-sm text-danger">{error}</p>;
  }

  if (characters.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {t('production.characters.empty')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => (
        <article
          key={character.id}
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          <CharacterImage character={character} />
          <div className="space-y-2 p-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{character.name}</h3>
              {character.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{character.description}</p>
              ) : null}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {character.prompt || t('production.characters.noPrompt')}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
