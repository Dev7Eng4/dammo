import { z } from 'zod';

export const shortCardEngagementSchema = z
  .object({
    likes: z.string().optional(),
    comments: z.string().optional(),
    reposts: z.string().optional(),
    shares: z.string().optional(),
  })
  .strict();

export const shortCardContentSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    footer: z.string().min(1),
    engagement: shortCardEngagementSchema.optional(),
  })
  .strict();

export const assembleShortCardInputSchema = z
  .object({
    backgroundPath: z.string().min(1),
    audioPath: z.string().min(1),
    content: shortCardContentSchema,
    outputPath: z.string().min(1),
    workDir: z.string().min(1).optional(),
    kenBurns: z.boolean().optional(),
  })
  .strict();

export const shortCardSpecFileSchema = z
  .object({
    backgroundPath: z.string().min(1).optional(),
    audioPath: z.string().min(1).optional(),
    outputPath: z.string().min(1).optional(),
    workDir: z.string().min(1).optional(),
    kenBurns: z.boolean().optional(),
    content: shortCardContentSchema,
  })
  .strict();
