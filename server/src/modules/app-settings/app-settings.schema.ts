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
});
