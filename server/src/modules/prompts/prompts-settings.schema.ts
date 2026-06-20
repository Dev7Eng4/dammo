import { z } from 'zod';

export const llmTextProviderSchema = z.enum(['gpt', 'gemini']);
export const imageBrowserProviderSchema = z.enum(['flow']);

export const updatePromptsSettingsSchema = z.object({
  defaultLlmProvider: llmTextProviderSchema.optional(),
  defaultImageProvider: imageBrowserProviderSchema.optional(),
});
