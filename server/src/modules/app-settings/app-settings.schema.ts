import { z } from 'zod';

const sceneDensitySecSchema = z.number().int().min(1).max(300);

export const updateAppSettingsSchema = z.object({
  enableKenBurns: z.boolean().optional(),
  enableImageTransitions: z.boolean().optional(),
  chromeBackgroundUseOffscreen: z.boolean().optional(),
  aiSceneDensityMaxSec: z
    .object({
      high: sceneDensitySecSchema.optional(),
      medium: sceneDensitySecSchema.optional(),
      low: sceneDensitySecSchema.optional(),
    })
    .optional(),
  taskQueueConcurrency: z.number().int().min(1).max(8).optional(),
  verboseVideoLogs: z.boolean().optional(),
  aiScenePromptChromeProfileRole: z.enum(['main', 'sub']).optional(),
  aiScenePromptConcurrency: z.number().int().min(1).max(8).optional(),
  checkPromptFillLength: z.boolean().optional(),
});
