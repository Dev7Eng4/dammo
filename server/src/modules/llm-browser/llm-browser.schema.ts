import { z } from 'zod';

export const llmTextProviderSchema = z.enum(['gpt', 'gemini']);
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
  provider: imageBrowserProviderSchema.default('flow'),
  outputPath: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
  generationMode: z.enum(['browser', 'api']).default('browser'),
  referenceImagePath: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
});

export const llmBrowserGenerateVideoSchema = z.object({
  prompt: z.string().min(1),
  provider: videoBrowserProviderSchema.default('meta'),
  outputPath: z.string().min(1).optional(),
  outputDir: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
});
