import { z } from 'zod';

export const createMascotSchema = z.object({
  name: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
});

export const updateMascotSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    prompt: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });
