import { z } from 'zod';

export const promptPlaygroundRunSchema = z.object({
  outputType: z.enum(['text', 'image']).optional(),
  provider: z.enum(['gpt', 'gemini']).optional(),
  imageProvider: z.enum(['flow']).optional(),
  userPrompt: z.string().min(1),
  promptId: z.string().min(1).optional(),
});

export type PromptPlaygroundRunBody = z.infer<typeof promptPlaygroundRunSchema>;
