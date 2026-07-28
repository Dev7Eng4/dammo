import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import {
  backupPromptsJson,
  isLegacyPromptsStore,
  migrateLegacyPromptsToSets,
} from './prompts-migrate.js';
import type { PromptCategory, PromptLanguage, PromptSet, PromptsStore } from './prompts.types.js';

const EMPTY_STORE: PromptsStore = { promptSets: [] };

let migratedThisProcess = false;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function loadStore(): PromptsStore {
  const raw = readJson<unknown>(paths.prompts);

  if (!raw) return EMPTY_STORE;

  if (isLegacyPromptsStore(raw)) {
    if (!migratedThisProcess) {
      migratedThisProcess = true;
      void backupPromptsJson().catch(() => undefined);
      const promptSets = migrateLegacyPromptsToSets(raw.prompts);
      const next: PromptsStore = { promptSets };
      writeJson(paths.prompts, next);
      return next;
    }
  }

  const store = raw as PromptsStore;
  if (!Array.isArray(store.promptSets)) {
    return EMPTY_STORE;
  }
  return { promptSets: store.promptSets };
}

export class PromptsRepository {
  findAll(): PromptSet[] {
    return loadStore().promptSets;
  }

  findById(id: string): PromptSet | null {
    return loadStore().promptSets.find(set => set.id === id) ?? null;
  }

  findByKeyAndLanguage(key: string, language: PromptLanguage): PromptSet | null {
    const normalized = normalizeKey(key);
    return (
      loadStore().promptSets.find(set => set.key === normalized && set.language === language) ?? null
    );
  }

  findDefault(language: PromptLanguage, category: PromptCategory): PromptSet | null {
    return (
      loadStore().promptSets.find(
        set => set.language === language && set.category === category && set.isDefault === true,
      ) ?? null
    );
  }

  findByLanguageAndCategory(language: PromptLanguage, category: PromptCategory): PromptSet[] {
    return loadStore().promptSets.filter(
      set => set.language === language && set.category === category,
    );
  }

  prepend(set: PromptSet): PromptSet {
    updateJson(
      paths.prompts,
      store => ({
        promptSets: [set, ...(store.promptSets ?? [])],
      }),
      loadStore(),
    );
    return set;
  }

  update(id: string, updater: (set: PromptSet) => PromptSet): PromptSet | null {
    let updated: PromptSet | null = null;

    updateJson(
      paths.prompts,
      store => {
        const sets = store.promptSets ?? [];
        const index = sets.findIndex(set => set.id === id);
        if (index === -1) return store;

        updated = updater(sets[index]);
        const promptSets = [...sets];
        promptSets[index] = updated;
        return { promptSets };
      },
      loadStore(),
    );

    return updated;
  }

  /** Clear isDefault on other sets in the same language+category (except excludeId). */
  clearDefaultExcept(language: PromptLanguage, category: PromptCategory, excludeId: string): void {
    updateJson(
      paths.prompts,
      store => ({
        promptSets: (store.promptSets ?? []).map(set => {
          if (
            set.id !== excludeId &&
            set.language === language &&
            set.category === category &&
            set.isDefault
          ) {
            const { isDefault: _d, ...rest } = set;
            return rest;
          }
          return set;
        }),
      }),
      loadStore(),
    );
  }

  delete(id: string): boolean {
    let deleted = false;

    updateJson(
      paths.prompts,
      store => {
        const next = (store.promptSets ?? []).filter(set => set.id !== id);
        deleted = next.length !== (store.promptSets ?? []).length;
        return { promptSets: next };
      },
      loadStore(),
    );

    return deleted;
  }

  ensureStoreFile(): void {
    const raw = readJson<unknown>(paths.prompts);
    if (!raw) {
      writeJson(paths.prompts, EMPTY_STORE);
      return;
    }
    // Trigger migration if needed
    loadStore();
  }
}

export const promptsRepository = new PromptsRepository();
