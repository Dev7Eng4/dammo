import { z } from 'zod';

export const llmBrowserProviderSchema = z.enum(['gpt', 'gemini', 'flow']);
export const llmTextProviderSchema = z.enum(['gpt', 'gemini']);
export const imageBrowserProviderSchema = z.enum(['flow']);

export const llmBrowserOpenSchema = z.object({
  provider: llmBrowserProviderSchema,
});

export const llmBrowserSetupSchema = z.object({
  provider: llmBrowserProviderSchema,
  config: z
    .object({
      mode: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    })
    .default({}),
});

export const llmBrowserSendSchema = z.object({
  provider: llmBrowserProviderSchema,
  prompt: z.string().min(1),
});

export const llmBrowserResponseSchema = z.object({
  provider: llmBrowserProviderSchema,
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
  outputPath: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
});

export const llmBrowserChatSchema = z.object({
  provider: llmBrowserProviderSchema,
  prompt: z.string().min(1),
  config: z
    .object({
      mode: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    })
    .optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
  outputPath: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
});

export const llmBrowserGenerateImageSchema = z.object({
  prompt: z.string().min(1),
  provider: imageBrowserProviderSchema.default('flow'),
  outputPath: z.string().min(1).optional(),
  debugScreenshotPath: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  stableMs: z.number().int().positive().max(60_000).optional(),
});
