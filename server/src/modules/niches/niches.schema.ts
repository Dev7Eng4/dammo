import { z } from 'zod';

const nicheLanguageSchema = z.enum(['en', 'ko', 'ja', 'es', 'all']);

export const createNicheSchema = z.object({
  label: z.string().trim().min(1),
  language: nicheLanguageSchema,
});

export const updateNicheSchema = z.object({
  label: z.string().trim().min(1),
  language: nicheLanguageSchema.optional(),
});
