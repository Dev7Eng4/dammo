import { z } from 'zod';

const promptCategorySchema = z.enum(['thumbnail', 'transcript', 'meta', 'image']);
const promptOutputTypeSchema = z.enum(['text', 'image']);
const promptLanguageSchema = z.enum(['en', 'ko', 'ja', 'es']);

const promptKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'Key must be lowercase snake_case');

export const createPromptSchema = z.object({
  key: promptKeySchema,
  language: promptLanguageSchema,
  name: z.string().min(1).max(120),
  template: z.string().min(1),
  category: promptCategorySchema.default('meta'),
  outputType: promptOutputTypeSchema.default('text'),
  description: z.string().max(500).optional(),
});

export const updatePromptSchema = z
  .object({
    key: promptKeySchema.optional(),
    language: promptLanguageSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    template: z.string().min(1).optional(),
    category: promptCategorySchema.optional(),
    outputType: promptOutputTypeSchema.optional(),
    description: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const listPromptsQuerySchema = z.object({
  category: promptCategorySchema.optional(),
  language: promptLanguageSchema.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const promptKeyQuerySchema = z.object({
  language: promptLanguageSchema,
});

export const thumbnailStylesQuerySchema = z.object({
  language: promptLanguageSchema,
});
