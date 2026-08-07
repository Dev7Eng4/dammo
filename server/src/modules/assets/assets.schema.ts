import { z } from 'zod';

export const assetKindSchema = z.enum(['audioBar', 'fonts', 'smallVideo', 'siLocalStock', 'subscribe']);

export const listAssetsQuerySchema = z.object({
  kind: assetKindSchema,
});

export const deleteAssetsSchema = z.object({
  names: z.array(z.string().min(1)).min(1),
});

export const prepareColorSchema = z.object({
  keyColor: z.enum(['green', 'black']).default('green'),
});
