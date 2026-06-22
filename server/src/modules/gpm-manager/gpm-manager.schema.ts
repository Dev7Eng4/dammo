import { z } from 'zod';

export const gpmListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().optional(),
  sort: z.coerce.number().int().min(0).max(3).default(0),
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

export const deleteGpmProfileQuerySchema = z.object({
  mode: z.enum(['soft', 'hard']).default('soft'),
});

export const startGpmProfileSchema = z.object({
  remote_debugging_port: z.number().int().optional(),
  window_scale: z.number().optional(),
  window_pos: z.string().optional(),
  window_size: z.string().optional(),
  skip_proxy_check: z.boolean().optional(),
  addition_args: z.string().optional(),
});

export const createGpmGroupSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: z.number().int().optional(),
});

export const updateGpmGroupSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: z.number().int().optional(),
});
