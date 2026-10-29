import { z } from 'zod';

const statusSchema = z.enum(['draft', 'created', 'active', 'paused']);

const pageFields = {
  name: z.string().trim().min(1).max(75),
  topic: z.string().trim().max(100).default(''),
  category: z.string().trim().max(100).default(''),
  bio: z.string().trim().max(255).default(''),
  videoFormat: z.enum(['9:16', '16:9']).default('9:16'),
  mailAccountId: z.string().min(1),
  pageUrl: z.string().trim().max(500).default(''),
  notes: z.string().max(2000).optional(),
};

export const createFacebookPageSchema = z.object(pageFields);

export const updateFacebookPageSchema = z
  .object({
    ...pageFields,
    status: statusSchema,
    followers: z.number().int().min(0),
  })
  .partial();

export const listFacebookPagesQuerySchema = z.object({
  status: z.enum(['all', 'draft', 'created', 'active', 'paused']).default('all'),
  q: z.string().default(''),
});

export const postToFacebookPageSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  imageFile: z.string().trim().max(500).optional(),
});

export const uploadFacebookVideoSchema = z.object({
  videoFile: z.string().trim().min(1).max(500),
  caption: z.string().trim().max(2200).default(''),
});
