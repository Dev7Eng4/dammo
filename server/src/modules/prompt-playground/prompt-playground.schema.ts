import { z } from 'zod';

export const promptPlaygroundRunSchema = z.object({
  provider: z.enum(['gpt', 'gemini']).default('gpt'),
  userPrompt: z.string().min(1),
  promptId: z.string().min(1).optional(),
});
