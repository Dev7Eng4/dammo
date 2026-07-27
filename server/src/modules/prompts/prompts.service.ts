import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import {
  deletePromptFile,
  movePromptFile,
  readPromptSource,
  writePromptFile,
} from './prompts.file-store.js';
import { resolveUniquePromptKey } from './prompt-key.js';
import { promptsRepository } from './prompts.repository.js';
import type {
  CreatePromptInput,
  Prompt,
  PromptCategory,
  PromptLanguage,
  PromptResolved,
  UpdatePromptInput,
} from './prompts.types.js';

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function filterPrompts(
  prompts: Prompt[],
  category?: PromptCategory,
  language?: PromptLanguage,
  query?: string,
): Prompt[] {
  let results = prompts;

  if (category) {
    results = results.filter((prompt) => prompt.category === category);
  }

  if (language) {
    results = results.filter((prompt) => prompt.language === language);
  }

  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(
      (prompt) =>
        prompt.key.includes(q) ||
        prompt.name.toLowerCase().includes(q) ||
        (prompt.description?.toLowerCase().includes(q) ?? false),
    );
  }

  return results;
}

function assertNotSystemPrompt(prompt: Prompt): void {
  if (prompt.isSystem) {
    throw new AppError('System prompt cannot be modified', 403, 'SYSTEM_PROMPT_READONLY');
  }
}

function supportsReferenceImage(category: PromptCategory): boolean {
  return category === 'thumbnail' || category === 'image';
}

function resolveUseReferenceImage(
  category: PromptCategory,
  useReferenceImage?: boolean,
): boolean {
  if (!supportsReferenceImage(category)) return false;
  return useReferenceImage ?? false;
}

function supportsChannelBackgroundImage(category: PromptCategory): boolean {
  return category === 'thumbnail';
}

function resolveUseChannelBackgroundImage(
  category: PromptCategory,
  useChannelBackgroundImage?: boolean,
): boolean {
  if (!supportsChannelBackgroundImage(category)) return false;
  return useChannelBackgroundImage ?? false;
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

export class PromptsService {
  listPaginated(
    category: PromptCategory | undefined,
    language: PromptLanguage | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterPrompts(promptsRepository.findAll(), category, language, query);
    return paginate(filtered, page, limit);
  }

  getById(id: string): Prompt {
    const prompt = promptsRepository.findById(id);
    if (!prompt) {
      throw new AppError('Prompt not found', 404, 'NOT_FOUND');
    }
    return prompt;
  }

  getByKey(key: string, language: PromptLanguage): Prompt {
    const prompt = promptsRepository.findByKeyAndLanguage(normalizeKey(key), language);
    if (!prompt) {
      throw new AppError('Prompt not found', 404, 'NOT_FOUND');
    }
    return prompt;
  }

  async resolve(key: string, language: PromptLanguage): Promise<PromptResolved> {
    const prompt = this.getByKey(key, language);
    const template = await readPromptSource(prompt.language, prompt.key);
    return { ...prompt, template };
  }

  async create(input: CreatePromptInput): Promise<Prompt> {
    const name = input.name.trim();
    const key = input.key
      ? normalizeKey(input.key)
      : resolveUniquePromptKey(name, input.language);
    assertUniqueKeyLanguage(key, input.language);

    await writePromptFile(input.language, key, input.template);

    const category = input.category ?? 'meta';
    const now = new Date().toISOString();
    const useReferenceImage = resolveUseReferenceImage(category, input.useReferenceImage);
    const useChannelBackgroundImage = resolveUseChannelBackgroundImage(
      category,
      input.useChannelBackgroundImage,
    );
    const prompt: Prompt = {
      id: generateId(),
      key,
      language: input.language,
      name: name,
      category,
      outputType: input.outputType ?? 'text',
      ...(input.isSystem ? { isSystem: true } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(useReferenceImage ? { useReferenceImage: true } : {}),
      ...(useChannelBackgroundImage ? { useChannelBackgroundImage: true } : {}),
      createdAt: now,
      updatedAt: now,
    };

    return promptsRepository.prepend(prompt);
  }

  async update(id: string, input: UpdatePromptInput): Promise<Prompt> {
    const current = this.getById(id);
    assertNotSystemPrompt(current);
    const nextKey = current.key;
    const nextLanguage = input.language ?? current.language;

    assertUniqueKeyLanguage(nextKey, nextLanguage, id);

    const keyChanged = nextKey !== current.key;
    const languageChanged = nextLanguage !== current.language;
    const templateProvided = input.template !== undefined;

    if (keyChanged || languageChanged || templateProvided) {
      await movePromptFile(
        current.language,
        current.key,
        nextLanguage,
        nextKey,
        templateProvided ? input.template : undefined,
      );
    }

    const updated = promptsRepository.update(id, (record) => {
      const next: Prompt = {
        ...record,
        key: nextKey,
        language: nextLanguage,
        updatedAt: new Date().toISOString(),
      };

      if (input.name !== undefined) next.name = input.name.trim();
      if (input.category !== undefined) next.category = input.category;
      if (input.outputType !== undefined) next.outputType = input.outputType;

      const nextCategory = next.category;
      const nextUseReferenceImage = resolveUseReferenceImage(
        nextCategory,
        input.useReferenceImage !== undefined ? input.useReferenceImage : next.useReferenceImage,
      );
      if (nextUseReferenceImage) {
        next.useReferenceImage = true;
      } else {
        delete next.useReferenceImage;
      }

      const nextUseChannelBackgroundImage = resolveUseChannelBackgroundImage(
        nextCategory,
        input.useChannelBackgroundImage !== undefined
          ? input.useChannelBackgroundImage
          : next.useChannelBackgroundImage,
      );
      if (nextUseChannelBackgroundImage) {
        next.useChannelBackgroundImage = true;
      } else {
        delete next.useChannelBackgroundImage;
      }

      if (input.description !== undefined) {
        const description = input.description.trim();
        if (description) {
          next.description = description;
        } else {
          delete next.description;
        }
      }

      return next;
    });

    if (!updated) {
      throw new AppError('Prompt not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const prompt = this.getById(id);
    assertNotSystemPrompt(prompt);
    const deleted = promptsRepository.delete(id);
    if (!deleted) {
      throw new AppError('Prompt not found', 404, 'NOT_FOUND');
    }
    await deletePromptFile(prompt.language, prompt.key);
  }
}

export const promptsService = new PromptsService();
