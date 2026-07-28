import { promptsRepository } from '../../../prompts/prompts.repository.js';
import type { PromptCategory, PromptLanguage, PromptSet } from '../../../prompts/prompts.types.js';
import type { ProductionDestination } from '../../ports/production-destination.port.js';

export type PromptSetResolveSource = {
  language: PromptLanguage;
  promptSetIds?: {
    transcript?: string;
    meta?: string;
    thumbnail?: string;
    image?: string;
  };
  /** @deprecated Legacy thumbnail style key → PromptSet.key */
  thumbnailStyleKey?: string;
};

function asResolveSource(destination: ProductionDestination | PromptSetResolveSource): PromptSetResolveSource {
  return {
    language: destination.language,
    promptSetIds: 'promptSetIds' in destination ? destination.promptSetIds : undefined,
    thumbnailStyleKey: destination.thumbnailStyleKey,
  };
}

/**
 * Resolve PromptSet for a category:
 * channel override id → else default(language, category) → else legacy thumbnailStyleKey (thumbnail only) → null.
 */
export function resolvePromptSet(
  destination: ProductionDestination | PromptSetResolveSource,
  category: PromptCategory,
): PromptSet | null {
  const source = asResolveSource(destination);
  const overrideId = source.promptSetIds?.[category]?.trim();

  if (overrideId) {
    const byId = promptsRepository.findById(overrideId);
    if (
      byId &&
      byId.language === source.language &&
      byId.category === category
    ) {
      return byId;
    }
    console.warn(
      `[prompt-sets] Invalid override id "${overrideId}" for ${category}/${source.language}; falling back`,
    );
  }

  const defaultSet = promptsRepository.findDefault(source.language, category);
  if (defaultSet) {
    return defaultSet;
  }

  if (category === 'thumbnail') {
    const legacyKey = source.thumbnailStyleKey?.trim();
    if (legacyKey) {
      const byKey = promptsRepository.findByKeyAndLanguage(legacyKey, source.language);
      if (byKey && byKey.category === 'thumbnail') {
        return byKey;
      }
    }
  }

  return null;
}
