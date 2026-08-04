import { z } from 'zod';

export const createChromeProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export const updateChromeProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});
