import { z } from 'zod';

export const llmTextProviderSchema = z.enum(['gpt', 'gemini', 'claude']);
export const imageBrowserProviderSchema = z.enum(['flow', 'meta']);
export const videoBrowserProviderSchema = z.enum(['meta']);

export const llmBrowserOpenSchema = z.object({
  provider: llmTextProviderSchema,
});

export const llmBrowserSetupSchema = z.object({
  provider: llmTextProviderSchema,
  config: z
    .object({
      mode: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    })
    .default({}),
});

export const llmBrowserSendSchema = z.object({
  provider: llmTextProviderSchema,
  prompt: z.string().min(1),
});

export const llmBrowserResponseSchema = z.object({
  provider: llmTextProviderSchema,
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
});

export const llmBrowserChatSchema = z.object({
  provider: llmTextProviderSchema,
  prompt: z.string().min(1),
  config: z
    .object({
      mode: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    })
    .optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
});

export const llmBrowserGenerateImageSchema = z.object({
  prompt: z.string().min(1),
  provider: z.union([imageBrowserProviderSchema, z.literal('muse')]).default('flow'),
  aspectRatio: z.enum(['16:9', '3:4']).optional(),
  skipResize: z.boolean().optional(),
  outputPath: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
  generationMode: z.enum(['browser', 'api']).default('browser'),
  referenceImagePath: z.string().min(1).optional(),
  referenceImagePaths: z.array(z.string().min(1)).optional(),
  projectId: z.string().uuid().optional(),
});

export const llmBrowserGenerateVideoSchema = z.object({
  prompt: z.string().min(1),
  provider: z.union([videoBrowserProviderSchema, z.literal('muse')]).default('meta'),
  /** Muse only: clip length, 3–10 s. */
  durationSeconds: z.number().int().min(3).max(10).optional(),
  /** Muse only: image(s) to animate. */
  referenceImagePaths: z.array(z.string().min(1)).optional(),
  outputPath: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
});
