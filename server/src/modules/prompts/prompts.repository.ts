import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { Prompt, PromptLanguage, PromptsStore } from './prompts.types.js';

const EMPTY_STORE: PromptsStore = { prompts: [] };

type StoredPrompt = Prompt & { content?: string };

function sanitizePrompt(prompt: StoredPrompt): Prompt {
  const { content: _content, ...rest } = prompt;
  return rest;
}

function sanitizeStore(store: { prompts: StoredPrompt[] }): PromptsStore {
  return { prompts: store.prompts.map(sanitizePrompt) };
}

function loadStore(): PromptsStore {
  const raw = readJson<{ prompts: StoredPrompt[] }>(paths.prompts);
  return raw ? sanitizeStore(raw) : EMPTY_STORE;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

export class PromptsRepository {
  findAll(): Prompt[] {
    return loadStore().prompts;
  }

  findById(id: string): Prompt | null {
    return loadStore().prompts.find((prompt) => prompt.id === id) ?? null;
  }

  findByKeyAndLanguage(key: string, language: PromptLanguage): Prompt | null {
    const normalized = normalizeKey(key);
    return (
      loadStore().prompts.find(
        (prompt) => prompt.key === normalized && prompt.language === language,
      ) ?? null
    );
  }

  prepend(prompt: Prompt): Prompt {
    updateJson(
      paths.prompts,
      (store) =>
        sanitizeStore({
          prompts: [prompt, ...store.prompts],
        }),
      loadStore(),
    );
    return prompt;
  }

  update(id: string, updater: (prompt: Prompt) => Prompt): Prompt | null {
    let updated: Prompt | null = null;

    updateJson(
      paths.prompts,
      (store) => {
        const index = store.prompts.findIndex((prompt) => prompt.id === id);
        if (index === -1) return store;

        updated = updater(sanitizePrompt(store.prompts[index]));
        const prompts = [...store.prompts];
        prompts[index] = updated;
        return sanitizeStore({ prompts });
      },
      loadStore(),
    );

    return updated;
  }

  delete(id: string): boolean {
    let deleted = false;

    updateJson(
      paths.prompts,
      (store) => {
        const next = store.prompts.filter((prompt) => prompt.id !== id);
        deleted = next.length !== store.prompts.length;
        return sanitizeStore({ prompts: next });
      },
      loadStore(),
    );

    return deleted;
  }

  ensureStoreFile(): void {
    const raw = readJson<PromptsStore>(paths.prompts);
    if (!raw) {
      writeJson(paths.prompts, EMPTY_STORE);
    }
  }
}

export const promptsRepository = new PromptsRepository();
