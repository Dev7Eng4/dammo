import { z } from 'zod';

export const assetKindSchema = z.enum(['audioBar', 'fonts', 'smallVideo', 'siLocalStock']);

export const listAssetsQuerySchema = z.object({
  kind: assetKindSchema,
});

export const deleteAssetsSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});
