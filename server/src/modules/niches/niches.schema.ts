import { z } from 'zod';

export const createNicheSchema = z.object({
  label: z.string().trim().min(1),
});
