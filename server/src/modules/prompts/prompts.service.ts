import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import {
  deletePromptSetDir,
  movePromptSetDir,
  readPromptSetStepSource,
  writePromptSetStepFile,
} from './prompts.file-store.js';
import { resolveUniquePromptKey, resolveUniquePromptKeyAcrossLanguages, PROMPT_LANGUAGES } from './prompt-key.js';
import { promptsRepository } from './prompts.repository.js';
import type {
  CreatePromptSetInput,
  PromptCategory,
  PromptLanguage,
  PromptSet,
  PromptSetOption,
  PromptSetResolved,
  PromptStep,
  PromptStepInput,
  UpdatePromptSetInput,
} from './prompts.types.js';

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function filterSets(
  sets: PromptSet[],
  category?: PromptCategory,
  language?: PromptLanguage,
  query?: string,
): PromptSet[] {
  let results = sets;

  if (category) {
    results = results.filter(set => set.category === category);
  }

  if (language) {
    results = results.filter(set => set.language === language);
  }

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      set =>
        set.key.includes(q) ||
        set.name.toLowerCase().includes(q) ||
        (set.description?.toLowerCase().includes(q) ?? false),
    );
  }

  return results;
}

function assertNotSystemSet(set: PromptSet): void {
  if (set.isSystem) {
    throw new AppError('System prompt set cannot be modified', 403, 'SYSTEM_PROMPT_READONLY');
  }
}

function supportsReferenceImage(category: PromptCategory): boolean {
  return category === 'thumbnail' || category === 'image';
}

function supportsChannelBackgroundImage(category: PromptCategory): boolean {
  return category === 'thumbnail';
}

function assertUniqueKeyLanguage(key: string, language: PromptLanguage, excludeId?: string): void {
  const existing = promptsRepository.findByKeyAndLanguage(key, language);
  if (existing && existing.id !== excludeId) {
    throw new AppError(
      `Key "${key}" đã tồn tại cho ngôn ngữ ${language}`,
      400,
      'DUPLICATE_KEY',
    );
  }
}

function normalizeSteps(
  category: PromptCategory,
  inputs: PromptStepInput[],
): Array<PromptStep & { template: string }> {
  return inputs.map((input, index) => {
    const outputType = input.outputType ?? 'text';
    const useReferenceImage =
      supportsReferenceImage(category) && input.useReferenceImage === true;
    const useChannelBackgroundImage =
      supportsChannelBackgroundImage(category) && input.useChannelBackgroundImage === true;

    return {
      id: input.id?.trim() || generateId(),
      order: input.order ?? index,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      outputType,
      templateParams: input.templateParams ?? [],
      ...(input.outputSchema ? { outputSchema: input.outputSchema } : {}),
      ...(useReferenceImage ? { useReferenceImage: true } : {}),
      ...(useChannelBackgroundImage ? { useChannelBackgroundImage: true } : {}),
      template: input.template,
    };
  }).sort((a, b) => a.order - b.order).map((step, index) => ({ ...step, order: index }));
}

async function writeAllStepFiles(
  language: PromptLanguage,
  setKey: string,
  steps: Array<PromptStep & { template: string }>,
): Promise<PromptStep[]> {
  const persisted: PromptStep[] = [];
  for (const step of steps) {
    await writePromptSetStepFile(language, setKey, step.order, step.template);
    const { template: _t, ...meta } = step;
    persisted.push(meta);
  }
  return persisted;
}

export class PromptsService {
  listPaginated(
    category: PromptCategory | undefined,
    language: PromptLanguage | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterSets(promptsRepository.findAll(), category, language, query);
    return paginate(filtered, page, limit);
  }

  listOptions(language: PromptLanguage, category: PromptCategory): PromptSetOption[] {
    return promptsRepository
      .findByLanguageAndCategory(language, category)
      .map(set => ({
        id: set.id,
        name: set.name,
        key: set.key,
        isDefault: set.isDefault === true,
        stepCount: set.steps.length,
        useChannelBackgroundImage: set.steps.some(step => step.useChannelBackgroundImage === true),
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  getById(id: string): PromptSet {
    const set = promptsRepository.findById(id);
    if (!set) {
      throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
    }
    return set;
  }

  getByKey(key: string, language: PromptLanguage): PromptSet {
    const set = promptsRepository.findByKeyAndLanguage(normalizeKey(key), language);
    if (!set) {
      throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
    }
    return set;
  }

  async resolve(idOrKey: string, language?: PromptLanguage): Promise<PromptSetResolved> {
    let set = promptsRepository.findById(idOrKey);
    if (!set && language) {
      set = promptsRepository.findByKeyAndLanguage(normalizeKey(idOrKey), language);
    }
    if (!set) {
      throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
    }

    const stepsWithTemplates = await Promise.all(
      [...set.steps]
        .sort((a, b) => a.order - b.order)
        .map(async step => ({
          ...step,
          template: await readPromptSetStepSource(set!.language, set!.key, step.order),
        })),
    );

    return { ...set, stepsWithTemplates };
  }

  /** @deprecated Resolve by key — returns first step template for playground compat */
  async resolveLegacyKey(key: string, language: PromptLanguage): Promise<PromptSetResolved & { template: string }> {
    const resolved = await this.resolve(key, language);
    const first = resolved.stepsWithTemplates[0];
    return {
      ...resolved,
      template: first?.template ?? '',
      outputType: first?.outputType,
      useReferenceImage: first?.useReferenceImage,
      useChannelBackgroundImage: first?.useChannelBackgroundImage,
    } as PromptSetResolved & { template: string };
  }

  async create(input: CreatePromptSetInput): Promise<PromptSet> {
    if (input.language === 'all') {
      const items = await this.createForAllLanguages(input);
      return items[0];
    }
    return this.createForLanguage(input, input.language);
  }

  async createForAllLanguages(input: CreatePromptSetInput): Promise<PromptSet[]> {
    const name = input.name.trim();
    const key = input.key ? normalizeKey(input.key) : resolveUniquePromptKeyAcrossLanguages(name);
    const items: PromptSet[] = [];

    for (const language of PROMPT_LANGUAGES) {
      items.push(
        await this.createForLanguage(
          {
            ...input,
            language,
            key,
          },
          language,
        ),
      );
    }

    return items;
  }

  private async createForLanguage(
    input: CreatePromptSetInput,
    language: PromptLanguage,
  ): Promise<PromptSet> {
    if (!input.steps?.length) {
      throw new AppError('At least one step is required', 400, 'VALIDATION_ERROR');
    }

    const name = input.name.trim();
    const key = input.key ? normalizeKey(input.key) : resolveUniquePromptKey(name, language);
    assertUniqueKeyLanguage(key, language);

    const category = input.category ?? 'meta';
    const stepsWithTemplates = normalizeSteps(category, input.steps);
    const steps = await writeAllStepFiles(language, key, stepsWithTemplates);

    const now = new Date().toISOString();
    const set: PromptSet = {
      id: generateId(),
      key,
      name,
      language,
      category,
      steps,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.isDefault ? { isDefault: true } : {}),
      createdAt: now,
      updatedAt: now,
    };

    promptsRepository.prepend(set);

    if (set.isDefault) {
      promptsRepository.clearDefaultExcept(language, category, set.id);
    }

    return set;
  }

  async update(id: string, input: UpdatePromptSetInput): Promise<PromptSet> {
    const current = this.getById(id);

    // System sets: only isDefault may change
    if (current.isSystem) {
      const triedOtherFields =
        input.language !== undefined ||
        input.name !== undefined ||
        input.category !== undefined ||
        input.description !== undefined ||
        input.steps !== undefined;

      if (triedOtherFields) {
        throw new AppError(
          'System prompt set can only update isDefault',
          403,
          'SYSTEM_PROMPT_READONLY',
        );
      }

      if (input.isDefault === undefined) {
        return current;
      }

      const updated = promptsRepository.update(id, record => {
        const next: PromptSet = {
          ...record,
          updatedAt: new Date().toISOString(),
        };
        if (input.isDefault === true) {
          next.isDefault = true;
        } else {
          delete next.isDefault;
        }
        return next;
      });

      if (!updated) {
        throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
      }

      if (updated.isDefault) {
        promptsRepository.clearDefaultExcept(updated.language, updated.category, updated.id);
      }

      return updated;
    }

    const nextLanguage = input.language ?? current.language;
    const nextCategory = input.category ?? current.category;
    const nextKey = current.key;

    assertUniqueKeyLanguage(nextKey, nextLanguage, id);

    const languageChanged = nextLanguage !== current.language;

    if (languageChanged) {
      await movePromptSetDir(current.language, current.key, nextLanguage, nextKey);
    }

    let nextSteps = current.steps;
    if (input.steps) {
      const stepsWithTemplates = normalizeSteps(nextCategory, input.steps);
      // Remove old step files beyond new length
      for (const old of current.steps) {
        if (!stepsWithTemplates.some(s => s.order === old.order)) {
          // will be overwritten / cleaned by rewrite
        }
      }
      await deletePromptSetDir(nextLanguage, nextKey);
      nextSteps = await writeAllStepFiles(nextLanguage, nextKey, stepsWithTemplates);
    }

    const updated = promptsRepository.update(id, record => {
      const next: PromptSet = {
        ...record,
        key: nextKey,
        language: nextLanguage,
        category: nextCategory,
        steps: nextSteps,
        updatedAt: new Date().toISOString(),
      };

      if (input.name !== undefined) next.name = input.name.trim();

      if (input.description !== undefined) {
        const description = input.description.trim();
        if (description) next.description = description;
        else delete next.description;
      }

      if (input.isDefault === true) {
        next.isDefault = true;
      } else if (input.isDefault === false) {
        delete next.isDefault;
      }

      return next;
    });

    if (!updated) {
      throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
    }

    if (updated.isDefault) {
      promptsRepository.clearDefaultExcept(updated.language, updated.category, updated.id);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const set = this.getById(id);
    assertNotSystemSet(set);
    const deleted = promptsRepository.delete(id);
    if (!deleted) {
      throw new AppError('Prompt set not found', 404, 'NOT_FOUND');
    }
    await deletePromptSetDir(set.language, set.key);
  }
}

export const promptsService = new PromptsService();
