import { z } from 'zod';

export const createSourceChannelSchema = z.object({
  url: z.string().min(1),
});

export const sourceChannelVideosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  duration: z.enum(['all', 'under_1m', '1m_10m', '10m_30m', 'over_30m']).default('all'),
});

export const listSourceChannelsQuerySchema = z.object({
  platform: z.enum(['youtube', 'tiktok', 'facebook']).optional(),
  purpose: z
    .enum([
      'trend_tracking',
      'idea_reference',
      'licensed_source',
      'competitor_tracking',
      'reup',
      'background_footage',
    ])
    .optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
