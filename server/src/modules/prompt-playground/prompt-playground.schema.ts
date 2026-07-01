import { z } from 'zod';

export const promptPlaygroundRunSchema = z.object({
  outputType: z.enum(['text', 'image', 'video']).optional(),
  provider: z.enum(['gpt', 'gemini']).optional(),
  imageProvider: z.enum(['flow', 'meta']).optional(),
  videoProvider: z.enum(['meta']).optional(),
  userPrompt: z.string().min(1),
  promptId: z.string().min(1).optional(),
});

export type PromptPlaygroundRunBody = z.infer<typeof promptPlaygroundRunSchema>;
