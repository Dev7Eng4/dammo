import { z } from 'zod';

const visualStyleLanguageSchema = z.enum(['en', 'ko', 'ja', 'es', 'all']);

export const createVisualStyleSchema = z.object({
  name: z.string().trim().min(1),
  rule: z.string().trim().min(1),
  niche: z.string().trim().min(1),
  language: visualStyleLanguageSchema,
});

export const updateVisualStyleSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    rule: z.string().trim().min(1).optional(),
    niche: z.string().trim().min(1).optional(),
    language: visualStyleLanguageSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });
