import { z } from 'zod';

export const llmTextProviderSchema = z.enum(['gpt', 'gemini']);
export const imageBrowserProviderSchema = z.enum(['flow', 'meta']);
export const videoBrowserProviderSchema = z.enum(['meta']);

export const updatePromptsSettingsSchema = z.object({
  defaultLlmProvider: llmTextProviderSchema.optional(),
  defaultImageProvider: imageBrowserProviderSchema.optional(),
  defaultVideoProvider: videoBrowserProviderSchema.optional(),
});
