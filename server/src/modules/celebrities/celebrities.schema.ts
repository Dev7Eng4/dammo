import { z } from 'zod';

export const createCelebritySchema = z.object({
  name: z.string().trim().min(1),
  note: z.string().trim().optional(),
});

export const updateCelebritySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    note: z.string().trim().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const deleteCelebrityMediaSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});
