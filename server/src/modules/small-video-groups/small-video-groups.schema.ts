import { z } from 'zod';

export const createSmallVideoGroupSchema = z.object({
  name: z.string().trim().min(1),
  note: z.string().trim().optional(),
});

export const downloadSmallVideoSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), 'URL must start with http:// or https://'),
  groupId: z.string().trim().optional(),
});

export const deleteSmallVideoGroupMediaSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});
