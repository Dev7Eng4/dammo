import { z } from 'zod';

const promptCategorySchema = z.enum(['thumbnail', 'transcript', 'meta', 'image']);
const promptOutputTypeSchema = z.enum(['text', 'image', 'video']);
const specificPromptLanguageSchema = z.enum(['en', 'ko', 'ja', 'es']);
const promptLanguageSchema = z.enum(['en', 'ko', 'ja', 'es', 'all']);

const promptNicheSchema = z.string().min(1).max(100);

export const createPromptSchema = z.object({
  language: promptLanguageSchema,
  name: z.string().min(1).max(120),
  template: z.string().min(1),
  category: promptCategorySchema.default('meta'),
  niche: promptNicheSchema.default('all'),
  outputType: promptOutputTypeSchema.default('text'),
  description: z.string().max(500).optional(),
  key: z.string().min(1).max(100).optional(),
  useReferenceImage: z.boolean().optional(),
  useChannelBackgroundImage: z.boolean().optional(),
});

export const updatePromptSchema = z
  .object({
    language: promptLanguageSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    template: z.string().min(1).optional(),
    category: promptCategorySchema.optional(),
    niche: promptNicheSchema.optional(),
    outputType: promptOutputTypeSchema.optional(),
    description: z.string().max(500).optional(),
    useReferenceImage: z.boolean().optional(),
    useChannelBackgroundImage: z.boolean().optional(),
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
  language: specificPromptLanguageSchema,
});
