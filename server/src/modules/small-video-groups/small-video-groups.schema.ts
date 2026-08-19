import { z } from 'zod';

export const createSmallVideoGroupSchema = z.object({
  name: z.string().trim().min(1),
  note: z.string().trim().optional(),
});

export const deleteSmallVideoGroupMediaSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});
