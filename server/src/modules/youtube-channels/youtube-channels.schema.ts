import { z } from 'zod';

export const createYoutubeChannelSchema = z.object({
  mailAccountId: z.string().min(1),
  channelUrl: z.string().min(1),
  sourceChannelId: z.string().min(1),
});

export const listYoutubeChannelsQuerySchema = z.object({
  type: z.enum(['own_content', 'client', 'content_selling']).optional(),
  monetization: z.enum(['monetized', 'in_review', 'demonetized', 'limited']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
