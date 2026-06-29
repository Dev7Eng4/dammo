import { z } from 'zod';

export const createVisualStyleSchema = z.object({
  name: z.string().trim().min(1),
  rule: z.string().trim().min(1),
  niche: z.string().trim().min(1),
});

export const updateVisualStyleSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    rule: z.string().trim().min(1).optional(),
    niche: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });
