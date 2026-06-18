import { z } from 'zod';

export const llmProviderSchema = z.enum(['gpt', 'gemini']);

export const updatePromptsSettingsSchema = z.object({
  defaultLlmProvider: llmProviderSchema,
});
