import { z } from 'zod';

const promptCategorySchema = z.enum(['thumbnail', 'transcript', 'meta', 'image']);
const promptOutputTypeSchema = z.enum(['text', 'image', 'video']);
const promptLanguageSchema = z.enum(['en', 'ko', 'ja', 'es']);
const createPromptLanguageSchema = z.enum(['en', 'ko', 'ja', 'es', 'all']);

const promptStepInputSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(0).optional(),
  name: z.string().max(120).optional(),
  outputType: promptOutputTypeSchema.default('text'),
  useReferenceImage: z.boolean().optional(),
  useChannelBackgroundImage: z.boolean().optional(),
  templateParams: z.array(z.string().min(1).max(80)).default([]),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  template: z.string().min(1),
});

export const createPromptSetSchema = z.object({
  language: createPromptLanguageSchema,
  name: z.string().min(1).max(120),
  category: promptCategorySchema.default('meta'),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  steps: z.array(promptStepInputSchema).min(1),
});

export const updatePromptSetSchema = z
  .object({
    language: promptLanguageSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    category: promptCategorySchema.optional(),
    description: z.string().max(500).optional(),
    isDefault: z.boolean().optional(),
    steps: z.array(promptStepInputSchema).min(1).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const listPromptsQuerySchema = z.object({
  category: promptCategorySchema.optional(),
  language: promptLanguageSchema.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const promptSetOptionsQuerySchema = z.object({
  language: promptLanguageSchema,
  category: promptCategorySchema,
});

export const promptKeyQuerySchema = z.object({
  language: promptLanguageSchema,
});

export const thumbnailStylesQuerySchema = z.object({
  language: promptLanguageSchema,
});

/** @deprecated aliases for gradual route updates */
export const createPromptSchema = createPromptSetSchema;
export const updatePromptSchema = updatePromptSetSchema;
