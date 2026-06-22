import { z } from 'zod';

export const uploadVideosSchema = z.object({
  maxUploads: z.number().int().min(1).optional(),
  videoIds: z.array(z.string().min(1)).optional(),
});

export const uploadVideosBatchSchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1).optional(),
  maxUploads: z.number().int().min(1).optional(),
  videoIds: z.array(z.string().min(1)).optional(),
});
