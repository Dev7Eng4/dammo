import { z } from 'zod';

export const createSourceChannelSchema = z.object({
  url: z.string().min(1),
  purpose: z.enum([
    'trend_tracking',
    'idea_reference',
    'licensed_source',
    'competitor_tracking',
    'reup',
    'background_footage',
  ]),
  niche: z.string().min(1),
});

export const sourceChannelVideosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  duration: z.enum(['all', 'under_8m', '8m_30m', '30m_60m', 'over_60m']).default('all'),
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

export const updateSourceChannelSchema = z
  .object({
    notes: z.string().max(500).optional(),
    bumpRisk: z.literal(true).optional(),
  })
  .refine((data) => data.bumpRisk === true || data.notes !== undefined, {
    message: 'Provide notes or bumpRisk',
  });
