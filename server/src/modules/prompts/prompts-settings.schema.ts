import { z } from 'zod';

export const llmTextProviderSchema = z.enum(['gpt', 'gemini', 'claude']);
/** General content generation is offered with ChatGPT / Gemini only. */
const contentLlmProviderSchema = z.enum(['gpt', 'gemini']);
export const imageBrowserProviderSchema = z.enum(['flow', 'meta']);
export const videoBrowserProviderSchema = z.enum(['flow', 'meta']);

/** Chosen Chrome profile for a text task; null / blank = automatic. */
const chromeProfileIdSchema = z.string().trim().max(100).nullable().optional();

export const updatePromptsSettingsSchema = z.object({
  defaultLlmProvider: contentLlmProviderSchema.optional(),
  scriptRemakeLlmProvider: llmTextProviderSchema.optional(),
  scenePromptLlmProvider: llmTextProviderSchema.optional(),
  metadataLlmProvider: llmTextProviderSchema.optional(),
  contentChromeProfileId: chromeProfileIdSchema,
  scriptRemakeChromeProfileId: chromeProfileIdSchema,
  scenePromptChromeProfileId: chromeProfileIdSchema,
  metadataChromeProfileId: chromeProfileIdSchema,
  defaultReferenceImageProvider: imageBrowserProviderSchema.optional(),
  defaultSceneImageProvider: imageBrowserProviderSchema.optional(),
  defaultThumbnailProvider: imageBrowserProviderSchema.optional(),
  defaultVideoProvider: videoBrowserProviderSchema.optional(),
});
