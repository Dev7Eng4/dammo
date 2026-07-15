import { z } from 'zod';

export const gpmListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().optional(),
  sort: z.coerce.number().int().min(0).max(3).default(0),
  group_id: z.string().optional(),
});

export const createGpmProfileSchema = z.object({
  name: z.string().trim().min(1),
  group_id: z.string().nullable().optional(),
  raw_proxy: z.string().optional(),
  note: z.string().nullable().optional(),
});

export const updateGpmProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    group_id: z.string().nullable().optional(),
    raw_proxy: z.string().optional(),
    note: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const updateGpmProfileCapabilitiesSchema = z
  .object({
    flowEnabled: z.boolean().optional(),
    metaEnabled: z.boolean().optional(),
  })
  .refine((data) => data.flowEnabled !== undefined || data.metaEnabled !== undefined, {
    message: 'At least one capability field is required',
  });

export const deleteGpmProfileQuerySchema = z.object({
  mode: z.enum(['soft', 'hard']).default('soft'),
});

export const startGpmProfileSchema = z.object({
  win_scale: z.number().optional(),
  win_pos: z.string().optional(),
  win_size: z.string().optional(),
  addition_args: z.string().optional(),
});

export const gpmTestProfileSchema = z.object({}).default({});

export const createGpmGroupSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: z.number().int().optional(),
});

export const updateGpmGroupSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: z.number().int().optional(),
});
