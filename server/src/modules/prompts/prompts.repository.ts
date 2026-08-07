import { paths } from '../../config/paths.js';
import { readJson, updateJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { Prompt, PromptLanguage, PromptSet, PromptStep, PromptsStore } from './prompts.types.js';

const EMPTY_STORE: PromptsStore = { promptSets: [] };

type StoredPrompt = Prompt & { content?: string };
type LegacyStore = { prompts: StoredPrompt[] };

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function parsePromptKey(key: string): { baseKey: string; step: number } {
  const normalized = normalizeKey(key);
  const match = normalized.match(/^(.+)_step_(\d+)$/);
  if (match) {
    return { baseKey: match[1]!, step: Number(match[2]) };
  }
  return { baseKey: normalized, step: 1 };
}

function buildPromptKey(baseKey: string, step: number, stepCount: number): string {
  if (stepCount <= 1 && step === 1) return baseKey;
  return `${baseKey}_step_${step}`;
}

function flattenPromptSet(set: PromptSet): Prompt[] {
  const stepCount = set.steps.length;
  return [...set.steps]
    .sort((a, b) => a.step - b.step)
    .map((step) => ({
      id: step.id,
      key: step.key || buildPromptKey(set.baseKey, step.step, stepCount),
      language: set.language,
      name: set.name,
      category: set.category,
      niche: set.niche || 'all',
      outputType: step.outputType,
      description: step.description,
      isSystem: set.isSystem,
      useReferenceImage: step.useReferenceImage,
      useChannelBackgroundImage: step.useChannelBackgroundImage,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    }));
}

function flattenStore(store: PromptsStore): Prompt[] {
  return store.promptSets.flatMap(flattenPromptSet);
}

function migrateLegacyPrompts(prompts: StoredPrompt[]): PromptsStore {
  const groups = new Map<string, PromptSet>();

  for (const legacyPrompt of prompts) {
    const { content: _content, ...prompt } = legacyPrompt;
    const { baseKey, step } = parsePromptKey(prompt.key);
    const groupKey = `${prompt.language}::${baseKey}`;
    const existing = groups.get(groupKey);
    const nextUpdatedAt =
      existing && existing.updatedAt > prompt.updatedAt ? existing.updatedAt : prompt.updatedAt;

    const stepRecord: PromptStep = {
      id: prompt.id,
      key: normalizeKey(prompt.key),
      step,
      outputType: prompt.outputType,
      description: prompt.description,
      useReferenceImage: prompt.useReferenceImage,
      useChannelBackgroundImage: prompt.useChannelBackgroundImage,
    };

    if (!existing) {
      groups.set(groupKey, {
        id: `${prompt.language}:${baseKey}`,
        baseKey,
        language: prompt.language,
        name: prompt.name,
        category: prompt.category,
        niche: prompt.niche || 'all',
        isSystem: prompt.isSystem,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
        steps: [stepRecord],
      });
      continue;
    }

    existing.name = prompt.name;
    existing.category = prompt.category;
    existing.niche = prompt.niche || existing.niche || 'all';
    existing.isSystem = prompt.isSystem ?? existing.isSystem;
    existing.updatedAt = nextUpdatedAt;
    existing.steps.push(stepRecord);
  }

  return {
    promptSets: [...groups.values()].map((set) => ({
      ...set,
      steps: [...set.steps].sort((a, b) => a.step - b.step),
    })),
  };
}

function sanitizeStore(raw: PromptsStore | LegacyStore | null): PromptsStore {
  if (!raw) return EMPTY_STORE;
  if ('promptSets' in raw && Array.isArray(raw.promptSets)) {
    return {
      promptSets: raw.promptSets.map((set) => ({
        ...set,
        baseKey: normalizeKey(set.baseKey),
        niche: set.niche || 'all',
        steps: [...set.steps]
          .map((step) => ({
            id: step.id,
            key: normalizeKey(step.key),
            step: step.step,
            outputType: step.outputType,
            description: step.description,
            useReferenceImage: step.useReferenceImage,
            useChannelBackgroundImage: step.useChannelBackgroundImage,
          }))
          .sort((a, b) => a.step - b.step),
      })),
    };
  }
  if ('prompts' in raw && Array.isArray(raw.prompts)) {
    return migrateLegacyPrompts(raw.prompts);
  }
  return EMPTY_STORE;
}

function loadStore(): PromptsStore {
  const raw = readJson<PromptsStore | LegacyStore>(paths.prompts);
  return sanitizeStore(raw ?? null);
}

function cloneStore(store: PromptsStore): PromptsStore {
  return {
    promptSets: store.promptSets.map((set) => ({
      ...set,
      steps: set.steps.map((step) => ({ ...step })),
    })),
  };
}

function findSetIndexByBaseKey(
  promptSets: PromptSet[],
  baseKey: string,
  language: PromptLanguage,
): number {
  return promptSets.findIndex(
    (set) => set.baseKey === normalizeKey(baseKey) && set.language === language,
  );
}

export class PromptsRepository {
  findAll(): Prompt[] {
    return flattenStore(loadStore());
  }

  findById(id: string): Prompt | null {
    return this.findAll().find((prompt) => prompt.id === id) ?? null;
  }

  findByKeyAndLanguage(key: string, language: PromptLanguage): Prompt | null {
    const normalized = normalizeKey(key);
    return this.findAll().find((prompt) => prompt.key === normalized && prompt.language === language) ?? null;
  }

  findByKeyWithFallback(key: string, language: PromptLanguage): Prompt | null {
    const normalized = normalizeKey(key);
    const exact = this.findAll().find((prompt) => prompt.key === normalized && prompt.language === language) ?? null;
    if (exact || language === 'all') return exact;
    return this.findAll().find((prompt) => prompt.key === normalized && prompt.language === 'all') ?? null;
  }

  prepend(prompt: Prompt): Prompt {
    const normalizedKey = normalizeKey(prompt.key);
    const { baseKey, step } = parsePromptKey(normalizedKey);
    const nextPrompt: Prompt = { ...prompt, key: normalizedKey };

    updateJson(
      paths.prompts,
      (rawStore) => {
        const store = cloneStore(sanitizeStore(rawStore as PromptsStore | LegacyStore | null));
        const setIndex = findSetIndexByBaseKey(store.promptSets, baseKey, prompt.language);
        const stepRecord: PromptStep = {
          id: nextPrompt.id,
          key: normalizedKey,
          step,
          outputType: nextPrompt.outputType,
          description: nextPrompt.description,
          useReferenceImage: nextPrompt.useReferenceImage,
          useChannelBackgroundImage: nextPrompt.useChannelBackgroundImage,
        };

        if (setIndex === -1) {
          store.promptSets.unshift({
            id: `${prompt.language}:${baseKey}`,
            baseKey,
            language: prompt.language,
            name: prompt.name,
            category: prompt.category,
            niche: prompt.niche || 'all',
            isSystem: prompt.isSystem,
            createdAt: prompt.createdAt,
            updatedAt: prompt.updatedAt,
            steps: [stepRecord],
          });
          return store;
        }

        const set = store.promptSets[setIndex]!;
        set.name = prompt.name;
        set.category = prompt.category;
        set.niche = prompt.niche || 'all';
        set.isSystem = prompt.isSystem ?? set.isSystem;
        set.createdAt = set.createdAt || prompt.createdAt;
        set.updatedAt = prompt.updatedAt;
        set.steps = [stepRecord, ...set.steps.filter((item) => item.id !== prompt.id)].sort(
          (a, b) => a.step - b.step,
        );
        return store;
      },
      loadStore(),
    );
    return nextPrompt;
  }

  update(id: string, updater: (prompt: Prompt) => Prompt): Prompt | null {
    let updated: Prompt | null = null;

    updateJson(
      paths.prompts,
      (rawStore) => {
        const store = cloneStore(sanitizeStore(rawStore as PromptsStore | LegacyStore | null));
        let sourceSetIndex = -1;
        let sourceStepIndex = -1;
        let currentPrompt: Prompt | null = null;

        for (let i = 0; i < store.promptSets.length; i += 1) {
          const set = store.promptSets[i]!;
          const stepIndex = set.steps.findIndex((step) => step.id === id);
          if (stepIndex === -1) continue;
          sourceSetIndex = i;
          sourceStepIndex = stepIndex;
          currentPrompt = flattenPromptSet(set)[stepIndex] ?? null;
          break;
        }

        if (!currentPrompt || sourceSetIndex === -1 || sourceStepIndex === -1) return store;

        const nextPrompt = updater(currentPrompt);
        updated = { ...nextPrompt, key: normalizeKey(nextPrompt.key) };
        const sourceSet = store.promptSets[sourceSetIndex]!;
        sourceSet.steps.splice(sourceStepIndex, 1);

        if (sourceSet.steps.length === 0) {
          store.promptSets.splice(sourceSetIndex, 1);
        } else {
          sourceSet.updatedAt = updated.updatedAt;
        }

        const { baseKey, step } = parsePromptKey(updated.key);
        const targetSetIndex = findSetIndexByBaseKey(store.promptSets, baseKey, updated.language);
        const nextStep: PromptStep = {
          id: updated.id,
          key: updated.key,
          step,
          outputType: updated.outputType,
          description: updated.description,
          useReferenceImage: updated.useReferenceImage,
          useChannelBackgroundImage: updated.useChannelBackgroundImage,
        };

        if (targetSetIndex === -1) {
          store.promptSets.unshift({
            id: `${updated.language}:${baseKey}`,
            baseKey,
            language: updated.language,
            name: updated.name,
            category: updated.category,
            niche: updated.niche || 'all',
            isSystem: updated.isSystem,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            steps: [nextStep],
          });
          return store;
        }

        const targetSet = store.promptSets[targetSetIndex]!;
        targetSet.name = updated.name;
        targetSet.category = updated.category;
        targetSet.niche = updated.niche || 'all';
        targetSet.isSystem = updated.isSystem ?? targetSet.isSystem;
        targetSet.updatedAt = updated.updatedAt;
        targetSet.steps = [nextStep, ...targetSet.steps.filter((stepItem) => stepItem.id !== updated!.id)].sort(
          (a, b) => a.step - b.step,
        );
        return store;
      },
      loadStore(),
    );

    return updated;
  }

  delete(id: string): boolean {
    let deleted = false;

    updateJson(
      paths.prompts,
      (rawStore) => {
        const store = cloneStore(sanitizeStore(rawStore as PromptsStore | LegacyStore | null));
        const nextSets: PromptSet[] = [];

        for (const set of store.promptSets) {
          const nextSteps = set.steps.filter((step) => step.id !== id);
          if (nextSteps.length !== set.steps.length) {
            deleted = true;
          }
          if (nextSteps.length === 0) continue;
          nextSets.push({
            ...set,
            steps: nextSteps,
          });
        }

        return { promptSets: nextSets };
      },
      loadStore(),
    );

    return deleted;
  }

  ensureStoreFile(): void {
    const raw = readJson<PromptsStore | LegacyStore>(paths.prompts);
    if (!raw) {
      writeJson(paths.prompts, EMPTY_STORE);
      return;
    }
    if ('prompts' in raw || !('promptSets' in raw)) {
      writeJson(paths.prompts, sanitizeStore(raw));
    }
  }
}

export const promptsRepository = new PromptsRepository();
